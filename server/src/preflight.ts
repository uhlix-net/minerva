/**
 * Install-time preflight: runs every enabled module's checks that do not need the database
 * (DNS, TLS certificate, SSO/LDAP reachability, secrets, mail). Used by the Helm pre-install hook.
 * Exit code 1 if any check fails, so a broken install stops before anything is created.
 *   node dist/preflight.js [--json]
 */
import { config } from "./config.js";
import { loadModules, runChecks } from "./modules/registry.js";

const ctx = { config, log: (m: string) => console.error(m) };
await loadModules(ctx);
const results = await runChecks(ctx, { withDb: false });

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" } as const;
  console.log(`Minerva ${config.version} preflight for ${config.baseUrl}`);
  for (const r of results) console.log(`[${icon[r.status]}] ${r.name}: ${r.detail}`);
}
const failed = results.filter((r) => r.status === "fail");
if (failed.length) console.error(`${failed.length} check(s) failed.`);
process.exit(failed.length ? 1 : 0);
