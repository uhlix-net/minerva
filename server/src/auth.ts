import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config.js";
import { one, q } from "./db.js";
import type { ExternalIdentity } from "./modules/types.js";

export const SESSION_COOKIE = "minerva_session";

export interface SessionUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  is_admin: boolean;
  auth_source: string;
  prefs: Record<string, unknown>;
}

export const hashPassword = (pw: string) => hash(pw, { algorithm: 2 /* argon2id */ });

export async function createSession(userId: number, reply: FastifyReply) {
  const id = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + config.sessionDays * 86400_000);
  await q(`INSERT INTO sessions(id, user_id, expires_at) VALUES ($1, $2, $3)`, [id, userId, expires]);
  await q(`UPDATE users SET last_login = now() WHERE id = $1`, [userId]);
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.baseUrl.startsWith("https"),
    signed: true,
    expires,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const sid = sessionId(req);
  if (sid) await q(`DELETE FROM sessions WHERE id = $1`, [sid]);
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

function sessionId(req: FastifyRequest): string | undefined {
  const raw = req.cookies[SESSION_COOKIE];
  if (!raw) return undefined;
  const u = req.unsignCookie(raw);
  return u.valid ? (u.value ?? undefined) : undefined;
}

export async function currentUser(req: FastifyRequest): Promise<SessionUser | undefined> {
  const sid = sessionId(req);
  if (!sid) return undefined;
  return one<SessionUser>(
    `SELECT u.id, u.username, u.display_name, u.email, u.is_admin, u.auth_source, u.prefs
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND NOT u.disabled`,
    [sid],
  );
}

export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const u = await currentUser(req);
  if (!u) return reply.code(401).send({ error: "not signed in" });
  (req as any).user = u;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const u = await currentUser(req);
  if (!u) return reply.code(401).send({ error: "not signed in" });
  if (!u.is_admin) return reply.code(403).send({ error: "administrators only" });
  (req as any).user = u;
}

/**
 * Find or create the local user row for an external identity. External users are keyed by
 * (auth_source, external_id); admin rights follow the identity provider's groups on every login.
 */
export async function upsertExternalUser(id: ExternalIdentity): Promise<number> {
  if (id.source === "local") return Number(id.externalId);
  const existing = await one(`SELECT id FROM users WHERE auth_source = $1 AND external_id = $2`, [id.source, id.externalId]);
  if (existing) {
    await q(`UPDATE users SET display_name = $2, email = $3, is_admin = $4 WHERE id = $1`, [
      existing.id,
      id.displayName,
      id.email ?? null,
      id.isAdmin,
    ]);
    return existing.id;
  }
  // Usernames are unique across sources; suffix the source if the name is taken.
  let username = id.username;
  if (await one(`SELECT 1 FROM users WHERE lower(username) = lower($1)`, [username])) username = `${id.username}@${id.source}`;
  const r = await one(
    `INSERT INTO users(username, display_name, email, auth_source, external_id, is_admin)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [username, id.displayName, id.email ?? null, id.source, id.externalId, id.isAdmin],
  );
  return r.id;
}

/** Create the default admin account when the database has no users. */
export async function bootstrapAdmin(log: (m: string) => void) {
  const n = await one(`SELECT count(*)::int AS n FROM users`);
  if (n.n > 0) return;
  const { username, password } = config.bootstrapAdmin;
  await q(`INSERT INTO users(username, display_name, password_hash, auth_source, is_admin) VALUES ($1, $2, $3, 'local', true)`, [
    username,
    "Administrator",
    await hashPassword(password),
  ]);
  log(`created default admin account '${username}'`);
}
