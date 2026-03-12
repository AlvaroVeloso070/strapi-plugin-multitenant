'use strict';

const TENANTS_TABLE = 'multitenancy_tenants';

// In-memory cache: Map<slug, { data: tenant|null, ts: number }>
const cache = new Map();

module.exports = ({ strapi }) => ({
  async init() {
    await this._ensureTable();
    strapi.log.info('[multitenancy] TenantManager ready.');
  },

  /**
   * Fetches a tenant by slug with in-memory caching.
   * Returns null if not found or inactive.
   *
   * @param {string} slug
   * @returns {Promise<object|null>}
   */
  async getTenant(slug) {
    const ttl = strapi.config.get('plugin::multitenancy.cacheTtlMs', 10_000);
    const cached = cache.get(slug);

    if (cached && Date.now() - cached.ts < ttl) {
      return cached.data;
    }

    // Force public schema to prevent the knex-proxy from redirecting
    // this query to a tenant schema (the control table always lives in public).
    const tenant = await strapi.db.connection
      .withSchema('public')
      .from(TENANTS_TABLE)
      .where({ slug, active: true })
      .first();

    const result = tenant ?? null;
    cache.set(slug, { data: result, ts: Date.now() });
    return result;
  },

  /**
   * Returns all active tenants ordered by creation date.
   *
   * @returns {Promise<object[]>}
   */
  async getAllTenants() {
    // Force public schema for the same reason as getTenant.
    return strapi.db.connection
      .withSchema('public')
      .from(TENANTS_TABLE)
      .where({ active: true })
      .orderBy('created_at', 'asc');
  },

  /**
   * Creates a new tenant: initializes the PostgreSQL schema and persists the record.
   *
   * @param {{ slug: string, name: string }} param0
   * @returns {Promise<object>}
   */
  async createTenant({ slug, name }) {
    const existing = await this.getTenant(slug);
    if (existing) {
      throw new Error(`Tenant "${slug}" already exists.`);
    }

    const schemaManager = strapi
      .plugin('multitenancy')
      .service('schemaManager');

    // 1. Create and initialize the PostgreSQL schema
    await schemaManager.createSchema(slug);

    // 2. Persist the tenant record in the public schema
    await strapi.db.connection
      .withSchema('public')
      .table(TENANTS_TABLE)
      .insert({
        slug,
        name,
        schema: slug,
        active: true,
        created_at: new Date(),
        updated_at: new Date(),
      });

    this.invalidateCache(slug);
    return this.getTenant(slug);
  },

  /**
   * Updates the display name of an existing tenant.
   *
   * @param {string} slug
   * @param {{ name: string }} param1
   * @returns {Promise<object>}
   */
  async updateTenant(slug, { name }) {
    const tenant = await this.getTenant(slug);
    if (!tenant) throw new Error(`Tenant "${slug}" not found.`);

    await strapi.db.connection
      .withSchema('public')
      .table(TENANTS_TABLE)
      .where({ slug })
      .update({ name, updated_at: new Date() });

    this.invalidateCache(slug);
    return this.getTenant(slug);
  },

  /**
   * Deactivates a tenant. With dropSchema: true, physically removes the PostgreSQL schema.
   * WARNING: dropSchema is irreversible.
   *
   * @param {string} slug
   * @param {{ dropSchema?: boolean }} options
   */
  async deleteTenant(slug, { dropSchema = false } = {}) {
    const tenant = await this.getTenant(slug);
    if (!tenant) throw new Error(`Tenant "${slug}" not found.`);

    await strapi.db.connection
      .withSchema('public')
      .table(TENANTS_TABLE)
      .where({ slug })
      .update({ active: false, updated_at: new Date() });

    if (dropSchema) {
      const schemaManager = strapi
        .plugin('multitenancy')
        .service('schemaManager');
      await schemaManager.dropSchema(tenant.schema);
    }

    this.invalidateCache(slug);
  },

  /**
   * Clears the in-memory cache for a specific slug or entirely.
   *
   * @param {string} [slug] - If provided, only clears the cache for this slug
   */
  invalidateCache(slug) {
    if (slug) cache.delete(slug);
    else cache.clear();
  },

  /**
   * Creates the tenant control table in the public schema if it does not exist (idempotent).
   * Uses .withSchema('public') explicitly to prevent the knex-proxy from
   * redirecting the creation to a tenant schema.
   */
  async _ensureTable() {
    const knex = strapi.db.connection;

    const exists = await knex.schema.withSchema('public').hasTable(TENANTS_TABLE);

    if (!exists) {
      await knex.schema.withSchema('public').createTable(TENANTS_TABLE, (t) => {
        t.increments('id').primary();
        t.string('slug', 100).notNullable().unique()
          .comment('Subdomain that identifies the tenant');
        t.string('name', 255).notNullable()
          .comment('Display name of the tenant');
        t.string('schema', 100).notNullable()
          .comment('PostgreSQL schema name');
        t.boolean('active').defaultTo(true).notNullable();
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(knex.fn.now());

        t.index(['slug'], 'idx_mt_tenants_slug');
      });

      strapi.log.info(`[multitenancy] Control table "${TENANTS_TABLE}" created in public schema.`);
    }
  },
});
