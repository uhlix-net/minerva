import { readFileSync } from "node:fs";

/** Read an env var, or the contents of the file named by <NAME>_FILE (Kubernetes secret mounts). */
function env(name: string, fallback = ""): string {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, "utf8").trim();
    } catch {
      /* fall through */
    }
  }
  return process.env[name] ?? fallback;
}

const list = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  version: process.env.MINERVA_VERSION ?? "0.1.0",
  port: Number(env("PORT", "8080")),
  baseUrl: env("MINERVA_BASE_URL", "http://localhost:8080").replace(/\/$/, ""),
  siteName: env("MINERVA_SITE_NAME", "Minerva"),
  databaseUrl: env("DATABASE_URL", "postgres://minerva:minerva@localhost:5432/minerva"),
  dataDir: env("MINERVA_DATA_DIR", "./data"),
  webDir: env("MINERVA_WEB_DIR", ""),
  sessionSecret: env("MINERVA_SESSION_SECRET", "dev-insecure-session-secret"),
  sessionDays: Number(env("MINERVA_SESSION_DAYS", "14")),
  bootstrapAdmin: {
    username: env("MINERVA_ADMIN_USERNAME", "admin"),
    password: env("MINERVA_ADMIN_PASSWORD", "admin"),
  },
  /** Built-in modules to enable. External modules load from pluginDir. */
  modules: list(env("MINERVA_MODULES", "auth-local,auth-oidc,auth-ldap,checks-core,markdown-import")),
  pluginDir: env("MINERVA_PLUGIN_DIR", ""),
  tlsCertFile: env("MINERVA_TLS_CERT_FILE", ""),
  oidc: {
    issuer: env("OIDC_ISSUER"),
    clientId: env("OIDC_CLIENT_ID"),
    clientSecret: env("OIDC_CLIENT_SECRET"),
    displayName: env("OIDC_DISPLAY_NAME", "Single sign-on"),
    scopes: env("OIDC_SCOPES", "openid profile email groups"),
    usernameClaim: env("OIDC_USERNAME_CLAIM", "preferred_username"),
    groupsClaim: env("OIDC_GROUPS_CLAIM", "groups"),
    adminGroups: list(env("OIDC_ADMIN_GROUPS")),
    allowedGroups: list(env("OIDC_ALLOWED_GROUPS")),
  },
  ldap: {
    url: env("LDAP_URL"),
    bindDn: env("LDAP_BIND_DN"),
    bindPassword: env("LDAP_BIND_PASSWORD"),
    userBase: env("LDAP_USER_BASE"),
    userFilter: env("LDAP_USER_FILTER", "(&(objectClass=user)(sAMAccountName={{username}}))"),
    usernameAttr: env("LDAP_USERNAME_ATTR", "sAMAccountName"),
    displayNameAttr: env("LDAP_DISPLAYNAME_ATTR", "displayName"),
    emailAttr: env("LDAP_EMAIL_ATTR", "mail"),
    adminGroups: list(env("LDAP_ADMIN_GROUPS")),
    allowedGroups: list(env("LDAP_ALLOWED_GROUPS")),
    displayName: env("LDAP_DISPLAY_NAME", "Directory account"),
    caFile: env("LDAP_CA_FILE"),
  },
  smtp: {
    host: env("SMTP_HOST"),
    port: Number(env("SMTP_PORT", "25")),
  },
};

export type Config = typeof config;
