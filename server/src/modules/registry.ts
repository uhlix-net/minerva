import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import authLdap from "./auth-ldap.js";
import authLocal from "./auth-local.js";
import authOidc from "./auth-oidc.js";
import checksCore from "./checks-core.js";
import markdownImport from "./markdown-import.js";
import type { AuthProvider, Check, CheckResult, MinervaModule, ModuleContext } from "./types.js";

const BUILTIN: MinervaModule[] = [authLocal, authOidc, authLdap, checksCore, markdownImport];

export interface LoadedModule {
  module: MinervaModule;
  enabled: boolean;
  /** At load time; use isConfigured() for the live value (auth settings can change at runtime). */
  configured: boolean;
  source: "builtin" | "plugin";
}

export const isConfigured = (l: LoadedModule, ctx: ModuleContext) => l.enabled && (l.module.configured ? l.module.configured(ctx) : true);

export const loaded: LoadedModule[] = [];

export async function loadModules(ctx: ModuleContext) {
  loaded.length = 0;
  const wanted = new Set(ctx.config.modules);
  const all: { m: MinervaModule; source: "builtin" | "plugin" }[] = BUILTIN.map((m) => ({ m, source: "builtin" }));
  if (ctx.config.pluginDir) {
    for (const f of readdirSync(ctx.config.pluginDir).filter((f) => /\.m?js$/.test(f)).sort()) {
      try {
        const m = (await import(pathToFileURL(path.join(ctx.config.pluginDir, f)).href)).default as MinervaModule;
        if (m?.id) {
          all.push({ m, source: "plugin" });
          wanted.add(m.id); // plugins dropped in the plugin directory are enabled
        }
      } catch (e) {
        ctx.log(`plugin ${f} failed to load: ${(e as Error).message}`);
      }
    }
  }
  for (const { m, source } of all) {
    const enabled = wanted.has(m.id);
    const configured = enabled && (m.configured ? m.configured(ctx) : true);
    loaded.push({ module: m, enabled, configured, source });
  }
}

export async function registerModules(ctx: ModuleContext) {
  // Register every enabled module, configured or not: a module configured later in the UI then
  // works without a restart (its routes check the live configuration).
  for (const l of loaded) if (l.enabled && l.module.register) await l.module.register(ctx);
}

export function authProviders(ctx: ModuleContext): AuthProvider[] {
  return loaded.filter((l) => isConfigured(l, ctx) && l.module.authProvider).map((l) => l.module.authProvider!(ctx));
}

export interface CheckReport extends CheckResult {
  id: string;
  name: string;
  module: string;
}

export async function runChecks(ctx: ModuleContext, opts: { withDb: boolean }): Promise<CheckReport[]> {
  const skip = new Set((process.env.MINERVA_SKIP_CHECKS ?? "").split(",").map((s) => s.trim()));
  const list: { c: Check; module: string }[] = [];
  for (const l of loaded) {
    if (!l.enabled) continue;
    for (const c of l.module.checks ?? []) if ((opts.withDb || !c.needsDb) && !skip.has(c.id)) list.push({ c, module: l.module.id });
  }
  return Promise.all(
    list.map(async ({ c, module }) => {
      try {
        return { id: c.id, name: c.name, module, ...(await c.run(ctx)) };
      } catch (e) {
        return { id: c.id, name: c.name, module, status: "fail" as const, detail: (e as Error).message };
      }
    }),
  );
}
