'use strict';

// Paths are relative: Strapi automatically adds the /multitenancy prefix for admin plugin routes.
module.exports = {
  type: 'admin',
  routes: [
    {
      method: 'GET',
      path: '/tenants',
      handler: 'tenantController.findAll',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/tenants/:slug',
      handler: 'tenantController.findOne',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/tenants',
      handler: 'tenantController.create',
      config: { policies: [] },
    },
    {
      method: 'PUT',
      path: '/tenants/:slug',
      handler: 'tenantController.update',
      config: { policies: [] },
    },
    {
      method: 'DELETE',
      path: '/tenants/:slug',
      handler: 'tenantController.delete',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/sync',
      handler: 'tenantController.sync',
      config: { policies: [] },
    },
  ],
};
