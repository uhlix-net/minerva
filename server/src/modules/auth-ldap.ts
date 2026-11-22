import { readFileSync } from "node:fs";
import { Client } from "ldapts";
import type { MinervaModule, ModuleContext } from "./types.js";

function newClient(ctx: ModuleContext) {
  const l = ctx.config.ldap;
  const ca = l.caFile ? [readFileSync(l.caFile)] : undefined;
  return new Client({ url: l.url, timeout: 8000, connectTimeout: 8000, tlsOptions: ca ? { ca } : undefined });
}

/** RFC 4515 escaping for a value placed inside a filter. */
const escapeFilter = (v: string) => v.replace(/[\\*()\0]/g, (c) => "\\" + c.charCodeAt(0).toString(16).padStart(2, "0"));
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v) as string | undefined;
const lower = (a: string[]) => a.map((s) => s.toLowerCase());

const mod: MinervaModule = {
  id: "auth-ldap",
  name: "LDAP / Active Directory",
  description: "Sign in with directory credentials (search with a service account, then bind as the user).",
  kind: "auth",
  configured: (ctx) => Boolean(ctx.config.ldap.enabled && ctx.config.ldap.url && ctx.config.ldap.userBase),
  authProvider: (ctx) => ({
    id: "ldap",
    type: "password",
    label: ctx.config.ldap.displayName,
    async authenticate(username, password) {
      const l = ctx.config.ldap;
      if (!password) return null; // an empty password would be an anonymous bind
      const c = newClient(ctx);
      try {
        await c.bind(l.bindDn, l.bindPassword);
        const filter = l.userFilter.replaceAll("{{username}}", escapeFilter(username));
        const { searchEntries } = await c.search(l.userBase, {
          scope: "sub",
          filter,
          attributes: [l.usernameAttr, l.displayNameAttr, l.emailAttr, "memberOf", "objectGUID", "entryUUID"],
          sizeLimit: 2,
        });
        if (searchEntries.length !== 1) return null;
        const e = searchEntries[0];
        const groups = lower(([] as string[]).concat((e.memberOf as string[]) ?? []));
        if (l.allowedGroups.length && !groups.some((g) => lower(l.allowedGroups).includes(g))) return null;
        const uc = newClient(ctx);
        try {
          await uc.bind(e.dn, password);
        } catch {
          return null;
        } finally {
          await uc.unbind().catch(() => {});
        }
        const uname = first(e[l.usernameAttr]) ?? username;
        return {
          source: "ldap",
          externalId: e.dn,
          username: uname,
          displayName: first(e[l.displayNameAttr]) ?? uname,
          email: first(e[l.emailAttr]),
          isAdmin: groups.some((g) => lower(l.adminGroups).includes(g)),
        };
      } finally {
        await c.unbind().catch(() => {});
      }
    },
  }),
  checks: [
    {
      id: "ldap-bind",
      name: "LDAP service account bind",
      needsDb: false,
      async run(ctx) {
        const l = ctx.config.ldap;
        if (!l.enabled) return { status: "skip", detail: "LDAP is turned off." };
        if (!l.url) return { status: "skip", detail: "No server URL set." };
        const c = newClient(ctx);
        try {
          await c.bind(l.bindDn, l.bindPassword);
          const { searchEntries } = await c.search(l.userBase, {
            scope: "base",
            filter: "(objectClass=*)",
          });
          return { status: "ok", detail: `Bound to ${l.url}; user base ${searchEntries.length ? "found" : "empty"}.` };
        } catch (e) {
          return { status: "fail", detail: `${l.url}: ${(e as Error).message}` };
        } finally {
          await c.unbind().catch(() => {});
        }
      },
    },
  ],
};

export default mod;
