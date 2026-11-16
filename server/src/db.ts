import pg from "pg";
import { config } from "./config.js";

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export async function q<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(text, params);
  return r.rows;
}

export async function one<T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(text, params))[0];
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

const MIGRATIONS: string[] = [
  // 1: core schema
  `
  CREATE TABLE users (
    id            serial PRIMARY KEY,
    username      text NOT NULL UNIQUE,
    display_name  text NOT NULL,
    email         text,
    password_hash text,
    auth_source   text NOT NULL DEFAULT 'local',
    external_id   text,
    is_admin      boolean NOT NULL DEFAULT false,
    disabled      boolean NOT NULL DEFAULT false,
    prefs         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_login    timestamptz
  );
  CREATE TABLE sessions (
    id         text PRIMARY KEY,
    user_id    int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE spaces (
    id          serial PRIMARY KEY,
    key         text NOT NULL UNIQUE,
    name        text NOT NULL,
    description text NOT NULL DEFAULT '',
    color       text NOT NULL DEFAULT '#7a1838',
    home_page_id int,
    created_by  int REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE pages (
    id          serial PRIMARY KEY,
    space_id    int NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    parent_id   int REFERENCES pages(id) ON DELETE CASCADE,
    title       text NOT NULL,
    body        jsonb,
    body_md     text,
    body_text   text NOT NULL DEFAULT '',
    position    int NOT NULL DEFAULT 0,
    version     int NOT NULL DEFAULT 1,
    created_by  int REFERENCES users(id) ON DELETE SET NULL,
    updated_by  int REFERENCES users(id) ON DELETE SET NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    search      tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(body_text, '')), 'B')) STORED
  );
  CREATE INDEX pages_space_parent ON pages(space_id, parent_id, position);
  CREATE INDEX pages_search ON pages USING gin(search);
  ALTER TABLE spaces ADD CONSTRAINT spaces_home_fk FOREIGN KEY (home_page_id) REFERENCES pages(id) ON DELETE SET NULL;
  CREATE TABLE page_versions (
    id         serial PRIMARY KEY,
    page_id    int NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    version    int NOT NULL,
    title      text NOT NULL,
    body       jsonb,
    body_md    text,
    updated_by int REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (page_id, version)
  );
  CREATE TABLE attachments (
    id         serial PRIMARY KEY,
    page_id    int REFERENCES pages(id) ON DELETE SET NULL,
    filename   text NOT NULL,
    mime       text NOT NULL,
    size       bigint NOT NULL,
    path       text NOT NULL,
    created_by int REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE settings (
    key   text PRIMARY KEY,
    value jsonb NOT NULL
  );
  `,
];

export async function migrate(log: (m: string) => void) {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await q<{ version: number }>(`SELECT version FROM schema_migrations`)).map((r) => r.version));
  for (let i = 0; i < MIGRATIONS.length; i++) {
    const v = i + 1;
    if (done.has(v)) continue;
    await tx(async (c) => {
      await c.query(MIGRATIONS[i]);
      await c.query(`INSERT INTO schema_migrations(version) VALUES ($1)`, [v]);
    });
    log(`applied migration ${v}`);
  }
}

export const schemaVersion = MIGRATIONS.length;

/** Wait for the database (it may start after the app pod). */
export async function waitForDb(log: (m: string) => void, attempts = 60) {
  for (let i = 1; ; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      log(`database not ready (${(e as Error).message}); retry ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
