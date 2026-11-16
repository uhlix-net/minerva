import { verify } from "@node-rs/argon2";
import { one } from "../db.js";
import type { MinervaModule } from "./types.js";

const mod: MinervaModule = {
  id: "auth-local",
  name: "Internal accounts",
  description: "Username and password accounts stored in Minerva (argon2id hashes).",
  kind: "auth",
  authProvider: () => ({
    id: "local",
    type: "password",
    label: "Minerva account",
    async authenticate(username, password) {
      const u = await one(
        `SELECT id, username, display_name, email, password_hash, is_admin FROM users
         WHERE lower(username) = lower($1) AND auth_source = 'local' AND NOT disabled`,
        [username],
      );
      if (!u?.password_hash || !(await verify(u.password_hash, password))) return null;
      return {
        source: "local",
        externalId: String(u.id),
        username: u.username,
        displayName: u.display_name,
        email: u.email ?? undefined,
        isAdmin: u.is_admin,
      };
    },
  }),
  checks: [
    {
      id: "default-admin-password",
      name: "Default admin password",
      needsDb: true,
      async run() {
        const u = await one(`SELECT password_hash FROM users WHERE username = 'admin' AND auth_source = 'local'`);
        if (!u?.password_hash) return { status: "skip", detail: "No local 'admin' account." };
        const dflt = await verify(u.password_hash, "admin");
        return dflt
          ? { status: "warn", detail: "The 'admin' account still uses the default password 'admin'." }
          : { status: "ok", detail: "The 'admin' account does not use the default password." };
      },
    },
  ],
};

export default mod;
