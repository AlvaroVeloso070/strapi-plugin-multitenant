'use strict';

const tenantContext = require('../context/tenant-context');

/**
 * Strapi 5 uses getSchemaName() and getConnection().withSchema() to qualify
 * table names with a schema. The schema comes from connectionSettings (static config).
 * This proxy overrides getSchemaName() to return the tenant's schema name
 * when executing inside a tenant context.
 *
 * @param {object} strapi - Global Strapi instance
 */
function install(strapi) {
  const db = strapi.db;
  if (!db || typeof db.getSchemaName !== 'function') {
    strapi.log.warn('[multitenancy] strapi.db.getSchemaName not found — proxy not installed.');
    return;
  }

  const originalGetSchemaName = db.getSchemaName.bind(db);

  db.getSchemaName = function () {
    const tenant = tenantContext.getTenant();
    if (tenant?.schema) {
      if (!/^[a-z0-9_-]+$/.test(tenant.schema)) {
        throw new Error(
          `[multitenancy] Invalid schema name: "${tenant.schema}"`
        );
      }
      return tenant.schema;
    }
    return originalGetSchemaName();
  };

  strapi.log.info('[multitenancy] strapi.db.getSchemaName proxy installed.');
}

module.exports = { install };
