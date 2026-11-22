import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, promises as fsp } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createSession, destroySession, hashPassword, requireAdmin, requireUser, upsertExternalUser, type SessionUser } from "./auth.js";
import { config } from "./config.js";
import { one, q, tx } from "./db.js";
import { AUTH_KINDS, authSettingsView, resetAuthSettings, saveAuthSettings, type AuthKind } from "./auth-settings.js";
import { authProviders, isConfigured, loaded, runChecks } from "./modules/registry.js";
import type { ModuleContext, PasswordAuthProvider } from "./modules/types.js";
import { createPage, pageTree, updatePage, VersionConflict } from "./pages.js";

const user = (req: unknown) => (req as { user: SessionUser }).user;
const bad = (reply: any, msg: string, code = 400) => reply.code(code).send({ error: msg });

const PREFS = z.object({
  theme: z.string().max(40).optional(),
  width: z.enum(["narrow", "standard", "wide", "full"]).optional(),
  density: z.enum(["compact", "comfortable", "spacious"]).optional(),
  editorMode: z.enum(["visual", "markdown"]).optional(),
});

export async function registerRoutes(app: FastifyInstance, ctx: ModuleContext) {
  // ---- health -------------------------------------------------------------------------
  app.get("/healthz", { logLevel: "warn" }, async () => ({ ok: true }));
  app.get("/readyz", { logLevel: "warn" }, async (req, reply) => {
    try {
      await one("SELECT 1");
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  // ---- meta / auth --------------------------------------------------------------------
  app.get("/api/meta", async () => ({
    siteName: config.siteName,
    version: config.version,
    providers: authProviders(ctx).map((p) => ({
      id: p.id,
      type: p.type,
      label: p.label,
      loginPath: p.type === "redirect" ? p.loginPath : undefined,
    })),
  }));

  app.post("/api/auth/login", async (req, reply) => {
    const b = z.object({ username: z.string().min(1), password: z.string(), provider: z.string().optional() }).safeParse(req.body);
    if (!b.success) return bad(reply, "username and password required");
    const pw = authProviders(ctx).filter((p): p is PasswordAuthProvider => p.type === "password");
    const order = b.data.provider ? pw.filter((p) => p.id === b.data.provider) : pw;
    for (const p of order) {
      try {
        const id = await p.authenticate(b.data.username, b.data.password);
        if (id) {
          const uid = await upsertExternalUser(id);
          const u = await one(`SELECT disabled FROM users WHERE id = $1`, [uid]);
          if (u?.disabled) return bad(reply, "account disabled", 403);
          await createSession(uid, reply);
          return { ok: true };
        }
      } catch (e) {
        req.log.warn(`login via ${p.id} failed: ${(e as Error).message}`);
      }
    }
    return bad(reply, "invalid username or password", 401);
  });

  ctx.loginExternal = async (identity, reply) => {
    const uid = await upsertExternalUser(identity);
    const u = await one(`SELECT disabled FROM users WHERE id = $1`, [uid]);
    if (u?.disabled) throw new Error("account disabled");
    await createSession(uid, reply);
  };

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get("/api/me", { preHandler: requireUser }, async (req) => user(req));

  app.put("/api/me/prefs", { preHandler: requireUser }, async (req, reply) => {
    const p = PREFS.safeParse(req.body);
    if (!p.success) return bad(reply, "invalid preferences");
    const r = await one(`UPDATE users SET prefs = prefs || $2::jsonb WHERE id = $1 RETURNING prefs`, [user(req).id, JSON.stringify(p.data)]);
    return r.prefs;
  });

  app.put("/api/me/password", { preHandler: requireUser }, async (req, reply) => {
    const b = z.object({ current: z.string(), next: z.string().min(5) }).safeParse(req.body);
    if (!b.success) return bad(reply, "new password must be at least 5 characters");
    const u = user(req);
    if (u.auth_source !== "local") return bad(reply, "password is managed by your identity provider");
    const local = authProviders(ctx).find((p) => p.id === "local") as PasswordAuthProvider | undefined;
    if (!local || !(await local.authenticate(u.username, b.data.current))) return bad(reply, "current password is wrong", 403);
    await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [u.id, await hashPassword(b.data.next)]);
    return { ok: true };
  });

  // ---- spaces -------------------------------------------------------------------------
  app.get("/api/spaces", { preHandler: requireUser }, async () =>
    q(`SELECT s.id, s.key, s.name, s.description, s.color, s.home_page_id,
              (SELECT count(*)::int FROM pages p WHERE p.space_id = s.id) AS page_count,
              (SELECT max(updated_at) FROM pages p WHERE p.space_id = s.id) AS updated_at
         FROM spaces s ORDER BY s.name`),
  );

  app.post("/api/spaces", { preHandler: requireUser }, async (req, reply) => {
    const b = z
      .object({
        key: z.string().regex(/^[A-Z][A-Z0-9]{1,15}$/, "key: 2-16 capitals/digits, starting with a letter"),
        name: z.string().min(1).max(100),
        description: z.string().max(500).default(""),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#7a1838"),
      })
      .safeParse(req.body);
    if (!b.success) return bad(reply, b.error.issues[0].message);
    if (await one(`SELECT 1 FROM spaces WHERE key = $1`, [b.data.key])) return bad(reply, "space key already used", 409);
    const s = await one(`INSERT INTO spaces(key, name, description, color, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [
      b.data.key,
      b.data.name,
      b.data.description,
      b.data.color,
      user(req).id,
    ]);
    const home = await createPage(
      { spaceId: s.id, parentId: null, title: b.data.name, bodyMd: `Welcome to **${b.data.name}**.\n\n${b.data.description}` },
      user(req).id,
    );
    await q(`UPDATE spaces SET home_page_id = $2 WHERE id = $1`, [s.id, home]);
    return { key: b.data.key, homePageId: home };
  });

  app.get("/api/spaces/:key", { preHandler: requireUser }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const s = await one(`SELECT id, key, name, description, color, home_page_id FROM spaces WHERE key = $1`, [key]);
    if (!s) return bad(reply, "space not found", 404);
    return { ...s, tree: await pageTree(s.id) };
  });

  app.put("/api/spaces/:key", { preHandler: requireUser }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const b = z
      .object({ name: z.string().min(1).max(100), description: z.string().max(500), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) })
      .partial()
      .safeParse(req.body);
    if (!b.success) return bad(reply, "invalid space");
    const r = await one(
      `UPDATE spaces SET name = coalesce($2, name), description = coalesce($3, description), color = coalesce($4, color) WHERE key = $1 RETURNING key`,
      [key, b.data.name ?? null, b.data.description ?? null, b.data.color ?? null],
    );
    return r ? { ok: true } : bad(reply, "space not found", 404);
  });

  app.delete("/api/spaces/:key", { preHandler: requireAdmin }, async (req) => {
    await q(`DELETE FROM spaces WHERE key = $1`, [(req.params as { key: string }).key]);
    return { ok: true };
  });

  // ---- pages --------------------------------------------------------------------------
  app.get("/api/pages/:id", { preHandler: requireUser }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const p = await one(
      `SELECT p.id, p.space_id, s.key AS space_key, s.name AS space_name, p.parent_id, p.title, p.body, p.body_md, p.version,
              p.created_at, p.updated_at, cu.display_name AS created_by, uu.display_name AS updated_by
         FROM pages p JOIN spaces s ON s.id = p.space_id
         LEFT JOIN users cu ON cu.id = p.created_by LEFT JOIN users uu ON uu.id = p.updated_by
        WHERE p.id = $1`,
      [id],
    );
    if (!p) return bad(reply, "page not found", 404);
    const ancestors = await q(
      `WITH RECURSIVE a(id, parent_id, title, depth) AS (
         SELECT id, parent_id, title, 0 FROM pages WHERE id = $1
         UNION ALL SELECT p.id, p.parent_id, p.title, a.depth + 1 FROM pages p JOIN a ON p.id = a.parent_id)
       SELECT id, title FROM a WHERE depth > 0 ORDER BY depth DESC`,
      [id],
    );
    const children = await q(`SELECT id, title FROM pages WHERE parent_id = $1 ORDER BY position, title`, [id]);
    return { ...p, ancestors, children };
  });

  app.post("/api/pages", { preHandler: requireUser }, async (req, reply) => {
    const b = z
      .object({ space: z.string(), parentId: z.number().int().nullable().default(null), title: z.string().min(1).max(255) })
      .safeParse(req.body);
    if (!b.success) return bad(reply, "space and title required");
    const s = await one(`SELECT id FROM spaces WHERE key = $1`, [b.data.space]);
    if (!s) return bad(reply, "space not found", 404);
    if (b.data.parentId && !(await one(`SELECT 1 FROM pages WHERE id = $1 AND space_id = $2`, [b.data.parentId, s.id])))
      return bad(reply, "parent page not in this space");
    const id = await createPage({ spaceId: s.id, parentId: b.data.parentId, title: b.data.title, bodyMd: "" }, user(req).id);
    return { id };
  });

  app.put("/api/pages/:id", { preHandler: requireUser }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const b = z
      .object({
        title: z.string().min(1).max(255),
        body: z.any().nullable(),
        bodyMd: z.string().nullable(),
        bodyText: z.string().max(2_000_000).optional(),
        version: z.number().int(),
      })
      .safeParse(req.body);
    if (!b.success) return bad(reply, "invalid page");
    try {
      return await updatePage(id, b.data, user(req).id);
    } catch (e) {
      if (e instanceof VersionConflict) return bad(reply, `Someone else saved this page first (${e.message}). Reload to see their changes.`, 409);
      if ((e as Error).message === "not found") return bad(reply, "page not found", 404);
      throw e;
    }
  });

  app.delete("/api/pages/:id", { preHandler: requireUser }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const p = await one(`SELECT p.id, s.home_page_id FROM pages p JOIN spaces s ON s.id = p.space_id WHERE p.id = $1`, [id]);
    if (!p) return bad(reply, "page not found", 404);
    if (p.home_page_id === id) return bad(reply, "the space home page cannot be deleted");
    await q(`DELETE FROM pages WHERE id = $1`, [id]);
    return { ok: true };
  });

  app.post("/api/pages/:id/move", { preHandler: requireUser }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const b = z.object({ parentId: z.number().int().nullable(), position: z.number().int().min(0) }).safeParse(req.body);
    if (!b.success) return bad(reply, "parentId and position required");
    return tx(async (c) => {
      const p = (await c.query(`SELECT space_id FROM pages WHERE id = $1`, [id])).rows[0];
      if (!p) return bad(reply, "page not found", 404);
      if (b.data.parentId !== null) {
        const cyc = await c.query(
          `WITH RECURSIVE a(id, parent_id) AS (SELECT id, parent_id FROM pages WHERE id = $1
             UNION ALL SELECT p.id, p.parent_id FROM pages p JOIN a ON p.id = a.parent_id)
           SELECT 1 FROM a WHERE id = $2`,
          [b.data.parentId, id],
        );
        if (cyc.rowCount) return bad(reply, "cannot move a page under itself");
      }
      const sib = (
        await c.query(`SELECT id FROM pages WHERE space_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND id <> $3 ORDER BY position, title`, [
          p.space_id,
          b.data.parentId,
          id,
        ])
      ).rows.map((r) => r.id as number);
      sib.splice(Math.min(b.data.position, sib.length), 0, id);
      await c.query(`UPDATE pages SET parent_id = $2 WHERE id = $1`, [id, b.data.parentId]);
      for (let i = 0; i < sib.length; i++) await c.query(`UPDATE pages SET position = $2 WHERE id = $1`, [sib[i], i]);
      return { ok: true };
    });
  });

  app.get("/api/pages/:id/versions", { preHandler: requireUser }, async (req) =>
    q(
      `SELECT v.version, v.title, v.created_at, u.display_name AS updated_by
         FROM page_versions v LEFT JOIN users u ON u.id = v.updated_by WHERE v.page_id = $1 ORDER BY v.version DESC`,
      [Number((req.params as { id: string }).id)],
    ),
  );

  app.get("/api/pages/:id/versions/:v", { preHandler: requireUser }, async (req, reply) => {
    const { id, v } = req.params as { id: string; v: string };
    const r = await one(
      `SELECT v.version, v.title, v.body, v.body_md, v.created_at, u.display_name AS updated_by
         FROM page_versions v LEFT JOIN users u ON u.id = v.updated_by WHERE v.page_id = $1 AND v.version = $2`,
      [Number(id), Number(v)],
    );
    return r ?? bad(reply, "version not found", 404);
  });

  // ---- search / recent ----------------------------------------------------------------
  app.get("/api/search", { preHandler: requireUser }, async (req) => {
    const term = String((req.query as { q?: string }).q ?? "").trim();
    if (!term) return [];
    return q(
      `SELECT p.id, p.title, s.key AS space_key, s.name AS space_name, p.updated_at,
              ts_headline('english', p.body_text, websearch_to_tsquery('english', $1),
                          'MaxWords=30, MinWords=10, StartSel=<mark>, StopSel=</mark>') AS snippet
         FROM pages p JOIN spaces s ON s.id = p.space_id
        WHERE p.search @@ websearch_to_tsquery('english', $1) OR p.title ILIKE '%' || $1 || '%'
        ORDER BY ts_rank(p.search, websearch_to_tsquery('english', $1)) DESC, p.updated_at DESC
        LIMIT 30`,
      [term],
    );
  });

  app.get("/api/recent", { preHandler: requireUser }, async () =>
    q(`SELECT p.id, p.title, s.key AS space_key, s.name AS space_name, s.color AS space_color, p.updated_at, u.display_name AS updated_by
         FROM pages p JOIN spaces s ON s.id = p.space_id LEFT JOIN users u ON u.id = p.updated_by
        ORDER BY p.updated_at DESC LIMIT 20`),
  );

  // ---- attachments --------------------------------------------------------------------
  const attDir = path.resolve(config.dataDir, "attachments");
  app.post("/api/attachments", { preHandler: requireUser }, async (req, reply) => {
    const file = await req.file();
    if (!file) return bad(reply, "no file");
    const pageId = Number((file.fields.pageId as any)?.value) || null;
    const month = new Date().toISOString().slice(0, 7);
    await fsp.mkdir(path.join(attDir, month), { recursive: true });
    const safe = path.basename(file.filename).replace(/[^\w.\-]+/g, "_").slice(-100) || "file";
    const rel = path.join(month, `${randomBytes(8).toString("hex")}-${safe}`);
    await pipeline(file.file, createWriteStream(path.join(attDir, rel)));
    if (file.file.truncated) {
      await fsp.rm(path.join(attDir, rel));
      return bad(reply, "file too large", 413);
    }
    const size = (await fsp.stat(path.join(attDir, rel))).size;
    const r = await one(
      `INSERT INTO attachments(page_id, filename, mime, size, path, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [pageId, safe, file.mimetype, size, rel, user(req).id],
    );
    return { id: r.id, url: `/api/attachments/${r.id}/${encodeURIComponent(safe)}` };
  });

  app.get("/api/attachments/:id/*", { preHandler: requireUser }, async (req, reply) => {
    const a = await one(`SELECT filename, mime, path FROM attachments WHERE id = $1`, [Number((req.params as { id: string }).id)]);
    if (!a) return bad(reply, "not found", 404);
    const inline = /^image\/(png|jpe?g|gif|webp)$/.test(a.mime);
    reply
      .header("Content-Type", inline ? a.mime : "application/octet-stream")
      .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${a.filename}"`)
      .header("Content-Security-Policy", "sandbox; default-src 'none'")
      .header("Cache-Control", "private, max-age=86400");
    return reply.send(createReadStream(path.join(attDir, a.path)));
  });

  // ---- admin --------------------------------------------------------------------------
  app.get("/api/admin/users", { preHandler: requireAdmin }, async () =>
    q(`SELECT id, username, display_name, email, auth_source, is_admin, disabled, created_at, last_login FROM users ORDER BY username`),
  );

  app.post("/api/admin/users", { preHandler: requireAdmin }, async (req, reply) => {
    const b = z
      .object({
        username: z.string().regex(/^[\w.@-]{2,64}$/),
        displayName: z.string().min(1).max(100),
        email: z.string().email().optional().or(z.literal("")),
        password: z.string().min(5),
        isAdmin: z.boolean().default(false),
      })
      .safeParse(req.body);
    if (!b.success) return bad(reply, b.error.issues[0].message);
    if (await one(`SELECT 1 FROM users WHERE lower(username) = lower($1)`, [b.data.username])) return bad(reply, "username taken", 409);
    const r = await one(
      `INSERT INTO users(username, display_name, email, password_hash, auth_source, is_admin) VALUES ($1, $2, $3, $4, 'local', $5) RETURNING id`,
      [b.data.username, b.data.displayName, b.data.email || null, await hashPassword(b.data.password), b.data.isAdmin],
    );
    return { id: r.id };
  });

  app.put("/api/admin/users/:id", { preHandler: requireAdmin }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const b = z.object({ isAdmin: z.boolean(), disabled: z.boolean(), password: z.string().min(5) }).partial().safeParse(req.body);
    if (!b.success) return bad(reply, "invalid update");
    if (id === user(req).id && (b.data.isAdmin === false || b.data.disabled)) return bad(reply, "you cannot demote or disable yourself");
    if (b.data.isAdmin !== undefined) await q(`UPDATE users SET is_admin = $2 WHERE id = $1`, [id, b.data.isAdmin]);
    if (b.data.disabled !== undefined) {
      await q(`UPDATE users SET disabled = $2 WHERE id = $1`, [id, b.data.disabled]);
      if (b.data.disabled) await q(`DELETE FROM sessions WHERE user_id = $1`, [id]);
    }
    if (b.data.password) await q(`UPDATE users SET password_hash = $2 WHERE id = $1 AND auth_source = 'local'`, [id, await hashPassword(b.data.password)]);
    return { ok: true };
  });

  app.get("/api/admin/modules", { preHandler: requireAdmin }, async () =>
    loaded.map((l) => ({
      id: l.module.id,
      name: l.module.name,
      description: l.module.description,
      kind: l.module.kind,
      enabled: l.enabled,
      configured: isConfigured(l, ctx),
      source: l.source,
      checks: (l.module.checks ?? []).length,
    })),
  );

  app.get("/api/admin/checks", { preHandler: requireAdmin }, async () => runChecks(ctx, { withDb: true }));

  // ---- authentication settings (Settings > Authentication) ----------------------------
  // Group lists: an array, or text with one group per line (LDAP DNs contain commas).
  const groupList = z
    .union([z.array(z.string().max(500)).max(100), z.string().max(20000)])
    .transform((v) => (Array.isArray(v) ? v : v.split(/\r?\n/)).map((s) => s.trim()).filter(Boolean));
  const url = z.string().trim().max(500);
  const text = z.string().trim().max(500);
  const AUTH_SCHEMAS = {
    oidc: z
      .object({
        enabled: z.boolean(),
        issuer: url.refine((v) => !v || /^https?:\/\//.test(v), "issuer must be an http(s) URL"),
        clientId: text,
        clientSecret: z.string().max(500),
        displayName: text.min(1, "button label required"),
        scopes: text.min(1, "scopes required"),
        usernameClaim: text.min(1),
        groupsClaim: text.min(1),
        adminGroups: groupList,
        allowedGroups: groupList,
      })
      .partial(),
    ldap: z
      .object({
        enabled: z.boolean(),
        url: url.refine((v) => !v || /^ldaps?:\/\//.test(v), "URL must start with ldap:// or ldaps://"),
        bindDn: text,
        bindPassword: z.string().max(500),
        userBase: text,
        userFilter: text.refine((v) => !v || v.includes("{{username}}"), "filter must contain {{username}}"),
        usernameAttr: text.min(1),
        displayNameAttr: text.min(1),
        emailAttr: text.min(1),
        adminGroups: groupList,
        allowedGroups: groupList,
        displayName: text.min(1, "label required"),
        caFile: text,
      })
      .partial(),
  };
  const kindOf = (req: unknown) => (req as { params: { kind: string } }).params.kind as AuthKind;
  const CHECK_ID = { oidc: "oidc-discovery", ldap: "ldap-bind" } as const;

  app.get("/api/admin/auth", { preHandler: requireAdmin }, async () => ({
    oidc: { ...authSettingsView("oidc"), redirectUri: `${config.baseUrl}/api/auth/oidc/callback` },
    ldap: authSettingsView("ldap"),
    modules: Object.fromEntries(
      AUTH_KINDS.map((k) => {
        const l = loaded.find((m) => m.module.id === `auth-${k}`);
        return [k, { loaded: Boolean(l?.enabled), active: l ? isConfigured(l, ctx) : false }];
      }),
    ),
  }));

  app.put("/api/admin/auth/:kind", { preHandler: requireAdmin }, async (req, reply) => {
    const kind = kindOf(req);
    if (!AUTH_KINDS.includes(kind)) return bad(reply, "unknown provider", 404);
    const b = AUTH_SCHEMAS[kind].safeParse(req.body);
    if (!b.success) return bad(reply, b.error.issues[0].message);
    await saveAuthSettings(kind, b.data);
    req.log.info(`auth settings for ${kind} changed by ${user(req).username}`);
    return authSettingsView(kind);
  });

  app.delete("/api/admin/auth/:kind", { preHandler: requireAdmin }, async (req, reply) => {
    const kind = kindOf(req);
    if (!AUTH_KINDS.includes(kind)) return bad(reply, "unknown provider", 404);
    await resetAuthSettings(kind);
    req.log.info(`auth settings for ${kind} reset to environment by ${user(req).username}`);
    return authSettingsView(kind);
  });

  /** Connection test with the saved settings; for LDAP, optionally a test sign-in. */
  app.post("/api/admin/auth/:kind/test", { preHandler: requireAdmin }, async (req, reply) => {
    const kind = kindOf(req);
    if (!AUTH_KINDS.includes(kind)) return bad(reply, "unknown provider", 404);
    const l = loaded.find((m) => m.module.id === `auth-${kind}`);
    const check = l?.module.checks?.find((c) => c.id === CHECK_ID[kind]);
    if (!l?.enabled || !check) return { status: "fail", detail: `Module auth-${kind} is not loaded (MINERVA_MODULES).` };
    let result;
    try {
      result = await check.run(ctx);
    } catch (e) {
      result = { status: "fail", detail: (e as Error).message };
    }
    const b = z.object({ username: z.string().min(1), password: z.string().min(1) }).safeParse(req.body);
    if (kind === "ldap" && b.success && result.status === "ok") {
      const p = l.module.authProvider!(ctx) as PasswordAuthProvider;
      try {
        const id = await p.authenticate(b.data.username, b.data.password);
        result = id
          ? { status: "ok", detail: `${result.detail} Signed in as ${id.username} (${id.displayName})${id.isAdmin ? ", admin" : ""}.` }
          : { status: "fail", detail: `${result.detail} Sign-in failed: wrong password, user not found, or not in an allowed group.` };
      } catch (e) {
        result = { status: "fail", detail: `Sign-in error: ${(e as Error).message}` };
      }
    }
    return result;
  });
}
