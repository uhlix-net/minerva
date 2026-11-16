import { X509Certificate } from "node:crypto";
import { promises as dnsp } from "node:dns";
import { constants, promises as fsp, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";
import type { Check, CheckResult, MinervaModule } from "./types.js";

const DAY = 86400_000;

function certVerdict(notAfter: Date, hostOk: boolean, host: string): CheckResult {
  const days = Math.floor((notAfter.getTime() - Date.now()) / DAY);
  if (!hostOk) return { status: "fail", detail: `Certificate does not cover ${host}.` };
  if (days < 0) return { status: "fail", detail: `Certificate expired ${-days} days ago (${notAfter.toISOString().slice(0, 10)}).` };
  if (days < 30) return { status: "warn", detail: `Certificate expires in ${days} days (${notAfter.toISOString().slice(0, 10)}).` };
  return { status: "ok", detail: `Valid for ${host}, expires ${notAfter.toISOString().slice(0, 10)} (${days} days).` };
}

function tcp(host: string, port: number, ms = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host, port, timeout: ms }, () => {
      s.end();
      resolve();
    });
    s.on("timeout", () => {
      s.destroy();
      reject(new Error("timeout"));
    });
    s.on("error", reject);
  });
}

const checks: Check[] = [
  {
    id: "base-url",
    name: "Public URL configured",
    needsDb: false,
    async run(ctx) {
      const u = new URL(ctx.config.baseUrl);
      if (u.hostname === "localhost") return { status: "warn", detail: "MINERVA_BASE_URL is localhost; SSO redirects will not work." };
      if (u.protocol !== "https:") return { status: "warn", detail: `${ctx.config.baseUrl} is not HTTPS.` };
      return { status: "ok", detail: ctx.config.baseUrl };
    },
  },
  {
    id: "dns",
    name: "DNS record for the hostname",
    needsDb: false,
    async run(ctx) {
      const host = new URL(ctx.config.baseUrl).hostname;
      if (host === "localhost") return { status: "skip", detail: "localhost" };
      try {
        const addrs = await dnsp.lookup(host, { all: true });
        return { status: "ok", detail: `${host} → ${addrs.map((a) => a.address).join(", ")}` };
      } catch (e) {
        return { status: "fail", detail: `${host} does not resolve (${(e as NodeJS.ErrnoException).code}). Create the DNS record.` };
      }
    },
  },
  {
    id: "tls-secret",
    name: "TLS certificate (mounted)",
    needsDb: false,
    async run(ctx) {
      const f = ctx.config.tlsCertFile;
      if (!f) return { status: "skip", detail: "MINERVA_TLS_CERT_FILE not set." };
      try {
        const pem = readFileSync(f, "utf8");
        const cert = new X509Certificate(pem.slice(0, pem.indexOf("-----END CERTIFICATE-----") + 25));
        const host = new URL(ctx.config.baseUrl).hostname;
        return certVerdict(new Date(cert.validTo), Boolean(cert.checkHost(host)), host);
      } catch (e) {
        return { status: "fail", detail: `Cannot read ${f}: ${(e as Error).message}` };
      }
    },
  },
  {
    id: "tls-live",
    name: "TLS certificate (served)",
    needsDb: true, // the ingress only serves the cert once the app is installed
    async run(ctx) {
      const u = new URL(ctx.config.baseUrl);
      if (u.protocol !== "https:") return { status: "skip", detail: "Not HTTPS." };
      return new Promise<CheckResult>((resolve) => {
        const s = tls.connect({ host: u.hostname, port: Number(u.port || 443), servername: u.hostname, timeout: 6000 }, () => {
          const c = s.getPeerCertificate();
          const authorized = s.authorized;
          s.end();
          const v = certVerdict(new Date(c.valid_to), !tls.checkServerIdentity(u.hostname, c), u.hostname);
          if (v.status === "ok" && !authorized)
            resolve({ status: "warn", detail: `${v.detail} Chain not trusted by this pod (${s.authorizationError}); set NODE_EXTRA_CA_CERTS.` });
          else resolve(v);
        });
        s.on("timeout", () => {
          s.destroy();
          resolve({ status: "fail", detail: `Timed out connecting to ${u.host}.` });
        });
        s.on("error", (e) => resolve({ status: "fail", detail: `${u.host}: ${e.message}` }));
      });
    },
  },
  {
    id: "database",
    name: "Database",
    needsDb: true,
    async run() {
      const { one, schemaVersion } = await import("../db.js");
      const r = await one(`SELECT version() AS v, (SELECT max(version) FROM schema_migrations) AS m`);
      const pgv = String(r.v).split(" ").slice(0, 2).join(" ");
      return r.m === schemaVersion
        ? { status: "ok", detail: `${pgv}, schema v${r.m}.` }
        : { status: "warn", detail: `${pgv}, schema v${r.m} (expected v${schemaVersion}).` };
    },
  },
  {
    id: "storage",
    name: "Attachment storage",
    needsDb: true,
    async run(ctx) {
      const dir = path.resolve(ctx.config.dataDir);
      try {
        await fsp.mkdir(dir, { recursive: true });
        await fsp.access(dir, constants.W_OK);
        const st = await fsp.statfs(dir);
        const free = st.bavail * st.bsize;
        const total = st.blocks * st.bsize;
        const pct = total ? Math.round((1 - free / total) * 100) : 0;
        const detail = `${dir} writable, ${(free / 1024 ** 3).toFixed(1)} GiB free (${pct}% used).`;
        return { status: pct >= 90 ? "warn" : "ok", detail };
      } catch (e) {
        return { status: "fail", detail: `${dir}: ${(e as Error).message}` };
      }
    },
  },
  {
    id: "session-secret",
    name: "Session secret",
    needsDb: false,
    async run(ctx) {
      const s = ctx.config.sessionSecret;
      if (s === "dev-insecure-session-secret") return { status: "fail", detail: "MINERVA_SESSION_SECRET is the development default." };
      if (s.length < 32) return { status: "warn", detail: "MINERVA_SESSION_SECRET is shorter than 32 characters." };
      return { status: "ok", detail: "Set." };
    },
  },
  {
    id: "smtp",
    name: "Mail server reachable",
    needsDb: false,
    async run(ctx) {
      const { host, port } = ctx.config.smtp;
      if (!host) return { status: "skip", detail: "SMTP_HOST not set." };
      try {
        await tcp(host, port);
        return { status: "ok", detail: `${host}:${port} accepts connections.` };
      } catch (e) {
        return { status: "warn", detail: `${host}:${port}: ${(e as Error).message}` };
      }
    },
  },
];

const mod: MinervaModule = {
  id: "checks-core",
  name: "Environment checks",
  description: "Checks DNS, TLS certificates, database, storage, secrets and mail before install and at runtime.",
  kind: "checks",
  checks,
};

export default mod;
