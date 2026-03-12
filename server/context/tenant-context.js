'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

module.exports = {
  /**
   * Executes `fn` within a tenant context.
   * All async code called from `fn` will have access
   * to the active tenant via getTenant().
   *
   * @param {object} tenant - The tenant object (slug, schema, name, etc.)
   * @param {Function} fn - Async function to execute in the tenant context
   * @returns {Promise<*>}
   */
  run(tenant, fn) {
    return storage.run({ tenant }, fn);
  },

  /**
   * Returns the active tenant for the current request context.
   * Returns null outside of a tenant context (bootstrap, cron jobs, etc.).
   *
   * @returns {object|null}
   */
  getTenant() {
    const store = storage.getStore();
    return store?.tenant ?? null;
  },
};
