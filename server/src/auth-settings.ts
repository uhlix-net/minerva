/**
 * OIDC and LDAP settings editable in the web UI (Settings > Authentication).
 *
 * The environment (Helm values / secrets) gives the defaults. Saving in the UI stores the whole
 * provider config in the settings table (key auth.oidc / auth.ldap), which then wins over the
 * environment; "Use environment" deletes the row. Values are applied to the shared config object
 * in place, so the auth modules pick them up without a restart.
 */
import { config } from "./config.js";
import { one, q } from "./db.js";

export type AuthKind = "oidc" | "ldap";
export const AUTH_KINDS: AuthKind[] = ["oidc", "ldap"];
/** The field holding the provider's secret; never sent to the browser. */
export const SECRET_FIELD = { oidc: "clientSecret", ldap: "bindPassword" } as const;

const envDefaults = {
  oidc: structuredClone(config.oidc),
  ldap: structuredClone(config.ldap),
};
const source: Record<AuthKind, "environment" | "database"> = { oidc: "environment", ldap: "environment" };
const listeners: (() => void)[] = [];

/** Called after settings change (e.g. to drop cached OIDC discovery). */
export const onAuthSettingsChange = (fn: () => void) => listeners.push(fn);

function apply(kind: AuthKind, saved: Record<string, unknown> | undefined) {
  const target = config[kind] as Record<string, unknown>;
  const base = envDefaults[kind] as Record<string, unknown>;
  for (const k of Object.keys(base)) target[k] = saved && k in saved ? saved[k] : structuredClone(base[k]);
  source[kind] = saved ? "database" : "environment";
}

export async function loadAuthSettings() {
  for (const kind of AUTH_KINDS) {
    const row = await one(`SELECT value FROM settings WHERE key = $1`, [`auth.${kind}`]);
    apply(kind, row?.value);
  }
  listeners.forEach((f) => f());
}

export function authSettingsView(kind: AuthKind) {
  const c = { ...(config[kind] as Record<string, unknown>) };
  const secretField = SECRET_FIELD[kind];
  const hasSecret = Boolean(c[secretField]);
  delete c[secretField];
  return { ...c, hasSecret, source: source[kind] };
}

/** Save a provider config. An empty secret keeps the current one. */
export async function saveAuthSettings(kind: AuthKind, values: Record<string, unknown>) {
  const secretField = SECRET_FIELD[kind];
  const next: Record<string, unknown> = {};
  for (const k of Object.keys(envDefaults[kind])) next[k] = k in values ? values[k] : (config[kind] as Record<string, unknown>)[k];
  if (!values[secretField]) next[secretField] = (config[kind] as Record<string, unknown>)[secretField];
  await q(`INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [
    `auth.${kind}`,
    JSON.stringify(next),
  ]);
  apply(kind, next);
  listeners.forEach((f) => f());
}

export async function resetAuthSettings(kind: AuthKind) {
  await q(`DELETE FROM settings WHERE key = $1`, [`auth.${kind}`]);
  apply(kind, undefined);
  listeners.forEach((f) => f());
}
