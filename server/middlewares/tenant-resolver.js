'use strict';

const tenantContext = require('../context/tenant-context');

module.exports = (config, { strapi }) => {
  return async (ctx, next) => {
    // Prefer hostname (reliable with app.proxy = true behind a reverse proxy).
    // Fall back to Origin/Referer when the frontend is on a different subdomain than the API.
    let hostname = ctx.request.hostname;
    let hostnameSource = 'host';

    const rootDomain = strapi.config.get(
      'plugin::multitenancy.rootDomain',
      process.env.ROOT_DOMAIN
    );

    let slug = extractSubdomain(hostname, rootDomain);

    // If not resolved via Host header, try Origin/Referer (fallback)
    if (!slug) {
      const origin = ctx.get('Origin') || ctx.get('Referer');
      if (origin) {
        try {
          const originUrl = new URL(origin);
          hostname = originUrl.hostname;
          hostnameSource = 'origin/referer';
          slug = extractSubdomain(hostname, rootDomain);
        } catch (_) { }
      }
    }

    const requireTenant = strapi.config.get('plugin::multitenancy.requireTenant', false);

    // No tenant subdomain identified
    if (!slug) {
      // Block access if tenant is required, except for admin and health-check routes
      const isPublicRoute = ctx.path.startsWith('/admin') || ctx.path.startsWith('/_health');
      if (requireTenant && !isPublicRoute) {
        ctx.status = 403;
        ctx.body = {
          error: 'tenant_required',
          message: 'This resource requires a tenant to be identified via hostname or Origin.',
        };
        return;
      }
      return next();
    }

    const tenantService = strapi
      .plugin('multitenancy')
      .service('tenantManager');

    let tenant;
    try {
      tenant = await tenantService.getTenant(slug);
    } catch (err) {
      strapi.log.error(`[multitenancy] Error looking up tenant "${slug}": ${err.message}`);
      ctx.status = 503;
      ctx.body = { error: 'service_unavailable', message: 'Tenant lookup failed.' };
      return;
    }

    if (!tenant) {
      ctx.status = 404;
      ctx.body = {
        error: 'tenant_not_found',
        message: `Tenant "${slug}" does not exist or is inactive.`,
      };
      return;
    }

    // Inject into Koa state for direct access in controllers if needed
    ctx.state.tenant = tenant;

    strapi.log.debug(`[multitenancy] ${ctx.method} ${ctx.path} → tenant: ${tenant.slug} (via ${hostnameSource})`);

    // CRITICAL: Execute the entire middleware chain and handler
    // inside the tenant context via AsyncLocalStorage.
    // The strapi-db-proxy reads this context to set the correct withSchema().
    await tenantContext.run(tenant, async () => {
      await next();
    });
  };
};

/**
 * Extracts the subdomain from a hostname given the rootDomain.
 *
 * Examples:
 *   extractSubdomain('acme.myapp.com', 'myapp.com') → 'acme'
 *   extractSubdomain('myapp.com', 'myapp.com')      → null
 *   extractSubdomain('a.b.myapp.com', 'myapp.com')  → null (nested not supported)
 *
 * @param {string} hostname
 * @param {string} rootDomain
 * @returns {string|null}
 */
function extractSubdomain(hostname, rootDomain) {
  if (!rootDomain || !hostname) return null;

  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) return null;

  const subdomain = hostname.slice(0, -suffix.length);

  // Reject nested subdomains (e.g.: a.b.myapp.com)
  if (!subdomain || subdomain.includes('.')) return null;

  // Reject slugs with invalid characters
  if (!/^[a-z0-9-]+$/.test(subdomain)) return null;

  return subdomain;
}
