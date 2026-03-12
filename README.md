# strapi-plugin-multitenant

> **PostgreSQL schema-per-tenant isolation for Strapi 5.**
> Identifies tenants via subdomain, propagates context through `AsyncLocalStorage`, and proxies Strapi's DB layer to route all ORM queries to the correct PostgreSQL schema — with zero changes to your content types or API.

[![npm version](https://img.shields.io/npm/v/strapi-plugin-multitenant.svg)](https://www.npmjs.com/package/strapi-plugin-multitenant)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Strapi v5](https://img.shields.io/badge/Strapi-v5-blue)](https://strapi.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-blue)](https://www.postgresql.org/)

---

## Overview

`strapi-plugin-multitenant` provides **physical data isolation** between tenants using PostgreSQL schemas. Each tenant gets its own schema (e.g., `acme`, `globex`) containing isolated copies of all content tables. System tables (`admin_*`, `strapi_*`, auth roles/permissions, and i18n locales) are automatically mapped as views pointing to the `public` schema, keeping administration centralized.

**Key characteristics:**

- **Zero query changes** — Strapi's ORM generates qualified SQL (`"acme"."articles"`) transparently via a proxy on `db.getSchemaName()`
- **Subdomain-based routing** — tenant resolved from `Host`, `Origin`, or `Referer` headers
- **In-memory cache** — configurable TTL for tenant lookups to minimize DB round-trips
- **Admin UI** — manage tenants (create, edit, delete, sync) directly from the Strapi dashboard
- **Schema sync** — add new content-type tables to all existing tenant schemas with one click or API call

---

## Architecture

```
Request: acme.myapp.com → POST /api/articles
          │
          ▼
┌─────────────────────────────┐
│  plugin::multitenancy       │
│  tenant-resolver middleware  │
│                             │
│  1. Extract subdomain       │
│     "acme" from Host header │
│                             │
│  2. Look up tenant in       │
│     public.multitenancy_    │
│     tenants (with cache)    │
│                             │
│  3. tenantContext.run(      │
│       tenant, next          │  ← AsyncLocalStorage wraps the
│     )                       │    entire request lifecycle
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  strapi-db-proxy            │
│                             │
│  db.getSchemaName() →       │
│    returns "acme"           │  ← All ORM queries now use
│    (from AsyncLocalStorage) │    "acme"."articles" etc.
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PostgreSQL                 │
│                             │
│  public schema:             │
│    multitenancy_tenants     │  ← control table
│    admin_*, strapi_*        │  ← shared system tables
│                             │
│  acme schema:               │
│    articles                 │  ← real isolated table
│    admin_users (VIEW)       │  ← view → public.admin_users
│    strapi_* (VIEWs)        │
└─────────────────────────────┘
```

### Schema layout per tenant

| Table type | How it appears in tenant schema |
|---|---|
| Content tables (your data) | Real isolated `TABLE` cloned from `public` |
| `admin_*`, `strapi_*` | `VIEW` → `public` (shared, always current) |
| `up_roles`, `up_permissions` | `VIEW` → `public` (shared roles/permissions) |
| `i18n_locale` | `VIEW` → `public` (shared locale config) |
| `up_users`, `up_users_role_*` | Real isolated `TABLE` (per-tenant users) |
| `multitenancy_tenants` | Only in `public`, never cloned |

---

## Requirements

| Requirement | Version |
|---|---|
| Node.js | ≥ 20.0.0 |
| Strapi | ^5.0.0 |
| PostgreSQL | any supported version |

> **SQLite and MySQL are not supported.** Schema isolation requires PostgreSQL.

---

## Installation

```bash
# npm
npm install strapi-plugin-multitenant

# yarn
yarn add strapi-plugin-multitenant
```

### 1. Register the plugin

In `config/plugins.ts` (or `.js`):

```ts
export default () => ({
  multitenancy: {
    enabled: true,
    resolve: './src/plugins/multitenancy', // if installed locally
    // resolve is not needed if installed from npm
    config: {
      rootDomain: env('ROOT_DOMAIN', 'myapp.com'),      // Required: your root domain
      requireTenant: false,          // Optional: block requests without a tenant
      cacheTtlMs: 10_000,           // Optional: tenant cache TTL in ms (default 10s)
      autoSyncOnBootstrap: false,    // Optional: sync all schemas on every startup
      debug: false,                  // Optional: enable verbose plugin logs
    },
  },
});
```

### 2. Register the middleware

In `config/middlewares.ts`, add `plugin::multitenancy.tenant-resolver` **before** `strapi::query`:

```ts
export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'strapi::poweredBy',
  'plugin::multitenancy.tenant-resolver', // ← add here
  'strapi::query',                        // ← tenant-resolver must come BEFORE this
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
```

> **Critical:** The `tenant-resolver` middleware must be positioned **before** `strapi::query` in the middleware stack. If placed after, the DB schema proxy will not be active when queries execute.

### 3. Set environment variables

In your `.env`:

```env
ROOT_DOMAIN=myapp.com
```

Or configure it directly via `config/plugins.ts` using the `rootDomain` option (takes precedence over the env var).

---

## Configuration Options

| Option | Type | Default | Description |
|---|---|---|---|
| `rootDomain` | `string` | `process.env.ROOT_DOMAIN` | Root domain used to extract the tenant subdomain. E.g.: `myapp.com` → `acme.myapp.com` resolves to tenant `acme`. |
| `requireTenant` | `boolean` | `false` | If `true`, requests with no identifiable tenant are rejected with `403`. Admin (`/admin`) and health-check (`/_health`) routes are always exempt. |
| `cacheTtlMs` | `number` | `10000` | Time-to-live in milliseconds for the in-memory tenant cache. Set to `0` to disable caching. |
| `autoSyncOnBootstrap` | `boolean` | `false` | If `true`, synchronizes all tenant schemas every time Strapi starts. Useful in development; consider disabling in production for faster boot times. |
| `debug` | `boolean` | `false` | If `true`, enables verbose `info` and `debug` level logs from the plugin. `warn` and `error` logs are always printed regardless of this setting. |

---

## Reverse Proxy & Security

### Enable trust proxy

If Strapi runs behind a reverse proxy (nginx, Caddy, AWS ALB, etc.), enable proxy trust so the `Host` header is correctly forwarded:

In `config/server.ts`:

```ts
export default ({ env }) => ({
  proxy: true,  // ← required when behind a reverse proxy
  app: {
    keys: env.array('APP_KEYS'),
  },
});
```

Without `proxy: true`, `ctx.request.hostname` may return the internal address instead of the real subdomain.

### Cross-origin requests (CORS)

When the frontend and API are on different subdomains (e.g., `acme.myapp.com` and `api.myapp.com`), the plugin falls back to the `Origin` or `Referer` header for tenant resolution. Ensure your CORS configuration allows these origins:

```ts
// config/middlewares.ts
{
  name: 'strapi::cors',
  config: {
    origin: (ctx) => {
      // Allow all subdomains of your root domain
      const origin = ctx.request.headers.origin || '';
      if (origin.endsWith('.myapp.com')) return origin;
      return false;
    },
    credentials: true,
  },
},
```

---

## Admin UI

After installation, a **Multitenancy** section appears in the Strapi admin Settings panel.

| Action | Description |
|---|---|
| **List tenants** | View all active tenants with slug, name, and schema |
| **Add tenant** | Create a new tenant — automatically provisions the PostgreSQL schema |
| **Edit tenant** | Update the display name or slug (schema name is immutable) |
| **Delete tenant** | Deactivates the tenant record (schema is preserved by default) |
| **Sync schemas** | Adds any missing tables/columns to all tenant schemas |

### Deleting a tenant schema

Deleting a tenant via the UI only marks it as inactive. To also **drop the PostgreSQL schema** (irreversible), call the API directly:

```bash
DELETE /multitenancy/tenants/:slug?dropSchema=true
```

---

## REST API

All endpoints are protected by Strapi admin authentication and accessible under the `/multitenancy` prefix.

| Method | Path | Description |
|---|---|---|
| `GET` | `/multitenancy/tenants` | List all active tenants |
| `GET` | `/multitenancy/tenants/:slug` | Get a single tenant |
| `POST` | `/multitenancy/tenants` | Create a tenant |
| `PUT` | `/multitenancy/tenants/:slug` | Update tenant name and/or slug |
| `DELETE` | `/multitenancy/tenants/:slug` | Deactivate tenant (`?dropSchema=true` to drop the schema) |
| `POST` | `/multitenancy/sync` | Sync all tenant schemas |

### Create tenant request body

```json
{
  "slug": "acme",
  "name": "Acme Corp",
  "schema": "acme"
}
```

- `slug`: lowercase letters, numbers, and hyphens only (`[a-z0-9-]+`). Used as the subdomain identifier. **Can be changed after creation.**
- `name`: display name, can contain any characters.
- `schema`: lowercase letters, numbers, underscores, and hyphens only (`[a-z0-9_-]+`). Becomes the PostgreSQL schema name. **Immutable after creation.**

### Update tenant request body

```json
{
  "name": "Acme Corporation",
  "slug": "acme-new"
}
```

Both `name` and `slug` are required. The `schema` field cannot be updated.

---

## Services API

You can access the plugin services from your own code:

```js
// Get the active tenant from within a request context
const tenantContext = require('strapi-plugin-multitenant/server/context/tenant-context');
const tenant = tenantContext.getTenant(); // { slug, name, schema, ... } | null

// Tenant management
const tenantManager = strapi.plugin('multitenancy').service('tenantManager');
await tenantManager.createTenant({ slug: 'acme', name: 'Acme Corp', schema: 'acme' });
await tenantManager.getTenant('acme');               // lookup by current slug
await tenantManager.getAllTenants();
await tenantManager.updateTenant('acme', { name: 'Acme Corp', slug: 'acme-new' }); // slug is optional
await tenantManager.deleteTenant('acme', { dropSchema: false });

// Schema management
const schemaManager = strapi.plugin('multitenancy').service('schemaManager');
await schemaManager.createSchema('acme');
await schemaManager.syncSchema('acme');
await schemaManager.syncAllSchemas();
await schemaManager.dropSchema('acme'); // irreversible!
```

---

## How Schema Isolation Works

When a new tenant `acme` is created:

1. `CREATE SCHEMA IF NOT EXISTS "acme"` is executed.
2. All **content tables** from `public` are cloned: `CREATE TABLE "acme"."articles" (LIKE public."articles" INCLUDING ALL)`.
3. Foreign keys between content tables are replicated within the `acme` schema.
4. **System tables** (`admin_*`, `strapi_*`, `up_roles`, `up_permissions`, `i18n_locale`) are created as `VIEW`s pointing to `public`.

When a request comes in from `acme.myapp.com`:

1. `tenant-resolver` extracts `acme` from the `Host` header.
2. Looks up the tenant in `public.multitenancy_tenants` (cached).
3. Wraps the request in `tenantContext.run(tenant, next)`.
4. The overridden `db.getSchemaName()` returns `"acme"` for the duration of the request.
5. Strapi's Knex ORM generates `SELECT * FROM "acme"."articles"` instead of `"public"."articles"`.

---

## Schema Sync

When you add a new content type to Strapi, the new table is created in the `public` schema. To propagate it to all tenant schemas:

- **Via UI:** Settings → Multitenancy → click **Sync schemas**
- **Via API:** `POST /multitenancy/sync`
- **On startup:** Set `autoSyncOnBootstrap: true` in the plugin config

The sync operation is idempotent — it only adds missing tables and columns; it never drops or modifies existing data.

---

## Limitations

- **PostgreSQL only** — the schema isolation mechanism requires PostgreSQL.
- **Nested subdomains not supported** — `a.b.myapp.com` is rejected; only single-level subdomains (`a.myapp.com`) are recognized.
- **Schema name is immutable** — the PostgreSQL schema name cannot be changed after creation. Create a new tenant and migrate data if renaming is needed.
- **Slug is mutable** — changing a tenant's slug changes its subdomain identifier. Existing sessions or cached links to the old subdomain will break until updated.
- **No data migration tools** — cross-tenant data migration is out of scope; use standard PostgreSQL tools (`pg_dump`, `INSERT INTO ... SELECT`).

---

## Contributing

Contributions are welcome. Please open an issue to discuss your proposal before submitting a pull request.

```bash
git clone https://github.com/veloso/strapi-plugin-multitenant.git
cd strapi-plugin-multitenant
```

---

## License

[MIT](./LICENSE) © Veloso
