'use strict';

const strapiDbProxy = require('./proxy/strapi-db-proxy');

module.exports = async ({ strapi }) => {
  // ─── STEP 1: Install the strapi-db-proxy ───────────────────────────────────
  // Strapi 5 uses getSchemaName() + withSchema() to qualify ALL ORM queries.
  // e.g.: SELECT * FROM "public"."up_users"   (without proxy)
  //       SELECT * FROM "acme"."up_users"     (with proxy) ← correct isolation
  //
  // For system tables (admin_*, strapi_*), the schema-manager creates VIEWS
  // in the tenant schema pointing to public — so "acme"."admin_users" → public.admin_users.
  strapiDbProxy.install(strapi);

  // ─── STEP 2: Ensure control table exists ───────────────────────────────────
  await strapi.plugin('multitenancy').service('tenantManager').init();

  // ─── STEP 3: Auto-sync all schemas on bootstrap (optional) ─────────────────
  const autoSync = strapi.config.get('plugin::multitenancy.autoSyncOnBootstrap', false);
  if (autoSync) {
    strapi.log.info('[multitenancy] autoSyncOnBootstrap enabled — syncing all schemas...');
    await strapi.plugin('multitenancy').service('schemaManager').syncAllSchemas();
  }

  strapi.log.info('[multitenancy] Plugin initialized.');
};
