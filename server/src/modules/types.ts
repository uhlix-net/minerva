import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export interface CheckResult {
  status: CheckStatus;
  detail: string;
}

export interface Check {
  id: string;
  name: string;
  /** Checks with needsDb=false also run in the install-time preflight (no database yet). */
  needsDb: boolean;
  run(ctx: ModuleContext): Promise<CheckResult>;
}

/** An authenticated identity returned by an auth provider. */
export interface ExternalIdentity {
  source: string;
  externalId: string;
  username: string;
  displayName: string;
  email?: string;
  isAdmin: boolean;
}

export interface PasswordAuthProvider {
  id: string;
  type: "password";
  label: string;
  authenticate(username: string, password: string): Promise<ExternalIdentity | null>;
}

export interface RedirectAuthProvider {
  id: string;
  type: "redirect";
  label: string;
  /** Path the browser is sent to, to start the login. */
  loginPath: string;
}

export type AuthProvider = PasswordAuthProvider | RedirectAuthProvider;

export interface ModuleContext {
  config: Config;
  log: (msg: string) => void;
  app?: FastifyInstance;
  /** Create or update the local user for an external identity and start a session (redirect providers). */
  loginExternal?: (identity: ExternalIdentity, reply: any) => Promise<void>;
}

/**
 * A Minerva module. Built-in modules live in src/modules; external ones are ES modules in
 * MINERVA_PLUGIN_DIR whose default export is a MinervaModule.
 */
export interface MinervaModule {
  id: string;
  name: string;
  description: string;
  kind: "auth" | "checks" | "feature";
  /** False when the module is enabled but not configured (e.g. OIDC without an issuer). */
  configured?(ctx: ModuleContext): boolean;
  register?(ctx: ModuleContext): Promise<void>;
  authProvider?(ctx: ModuleContext): AuthProvider;
  checks?: Check[];
}
