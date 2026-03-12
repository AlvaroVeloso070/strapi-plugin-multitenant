'use strict';

module.exports = {
  register({ strapi }) {
    // Register custom types, policies, etc. (future expansion)
  },

  async bootstrap(context) {
    return require('./server/bootstrap')(context);
  },

  middlewares: {
    'tenant-resolver': require('./server/middlewares/tenant-resolver'),
  },

  services: {
    tenantManager: require('./server/services/tenant-manager'),
    schemaManager: require('./server/services/schema-manager'),
  },

  controllers: {
    tenantController: require('./server/controllers/tenant-controller'),
  },

  routes: {
    admin: require('./server/routes/admin'),
  },
};
