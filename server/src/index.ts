import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapAdmin } from "./auth.js";
import { config } from "./config.js";
import { migrate, pool, waitForDb } from "./db.js";
import { loadModules, registerModules } from "./modules/registry.js";
import type { ModuleContext } from "./modules/types.js";
import { registerRoutes } from "./routes.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = config.webDir || path.resolve(here, "../../web/dist");

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? "info" }, trustProxy: true, bodyLimit: 10 * 1024 * 1024 });
const log = (m: string) => app.log.info(m);

await app.register(cookie, { secret: config.sessionSecret });
await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// CSRF: state-changing API calls must carry a header a cross-site form cannot set.
app.addHook("onRequest", async (req, reply) => {
  if (req.method !== "GET" && req.method !== "HEAD" && req.url.startsWith("/api/") && req.headers["x-minerva"] !== "1") {
    return reply.code(403).send({ error: "missing X-Minerva header" });
  }
});

app.addHook("onSend", async (req, reply) => {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("Referrer-Policy", "same-origin");
  reply.header("X-Frame-Options", "DENY");
  if (!reply.hasHeader("Content-Security-Policy")) {
    reply.header(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; " +
        "script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  }
});

const ctx: ModuleContext = { config, log, app };

await waitForDb(log);
await migrate(log);
await bootstrapAdmin(log);
await loadModules(ctx);
await registerRoutes(app, ctx);
await registerModules(ctx);

if (existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir, prefix: "/", wildcard: false, maxAge: "1h" });
  // SPA: any non-API path serves index.html.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/") || req.method !== "GET") return reply.code(404).send({ error: "not found" });
    return reply.header("Cache-Control", "no-cache").sendFile("index.html");
  });
} else {
  log(`web assets not found at ${webDir}; serving the API only`);
}

const close = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on("SIGTERM", close);
process.on("SIGINT", close);

await app.listen({ host: "0.0.0.0", port: config.port });
log(`Minerva ${config.version} at ${config.baseUrl}; modules: ${config.modules.join(", ")}`);
