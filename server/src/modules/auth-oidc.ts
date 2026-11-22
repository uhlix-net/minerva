import * as client from "openid-client";
import { onAuthSettingsChange } from "../auth-settings.js";
import type { MinervaModule, ModuleContext } from "./types.js";

let discovered: client.Configuration | undefined;
// Settings can change at runtime (Settings > Authentication): discover again on next use.
onAuthSettingsChange(() => {
  discovered = undefined;
});

const isConfigured = (ctx: ModuleContext) => Boolean(ctx.config.oidc.enabled && ctx.config.oidc.issuer && ctx.config.oidc.clientId);

async function oidcConfig(ctx: ModuleContext) {
  if (!discovered) {
    const o = ctx.config.oidc;
    discovered = await client.discovery(new URL(o.issuer), o.clientId, o.clientSecret);
  }
  return discovered;
}

const redirectUri = (ctx: ModuleContext) => `${ctx.config.baseUrl}/api/auth/oidc/callback`;
const COOKIE = "minerva_oidc";

const mod: MinervaModule = {
  id: "auth-oidc",
  name: "OpenID Connect SSO",
  description: "Single sign-on through any OpenID Connect provider (Authentik, Keycloak, Entra ID, ...).",
  kind: "auth",
  configured: isConfigured,
  authProvider: (ctx) => ({
    id: "oidc",
    type: "redirect",
    label: ctx.config.oidc.displayName,
    loginPath: "/api/auth/oidc/login",
  }),
  async register(ctx) {
    const app = ctx.app!;
    const o = ctx.config.oidc;

    app.get("/api/auth/oidc/login", async (req, reply) => {
      if (!isConfigured(ctx)) return reply.redirect("/login?error=sso_failed");
      const cfg = await oidcConfig(ctx);
      const verifier = client.randomPKCECodeVerifier();
      const state = client.randomState();
      const nonce = client.randomNonce();
      const url = client.buildAuthorizationUrl(cfg, {
        redirect_uri: redirectUri(ctx),
        scope: o.scopes,
        code_challenge: await client.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        state,
        nonce,
      });
      reply.setCookie(COOKIE, JSON.stringify({ verifier, state, nonce }), {
        path: "/api/auth/oidc",
        httpOnly: true,
        secure: ctx.config.baseUrl.startsWith("https"),
        sameSite: "lax",
        signed: true,
        maxAge: 600,
      });
      return reply.redirect(url.href);
    });

    app.get("/api/auth/oidc/callback", async (req, reply) => {
      if (!isConfigured(ctx)) return reply.redirect("/login?error=sso_failed");
      const raw = req.cookies[COOKIE];
      const unsigned = raw ? req.unsignCookie(raw) : undefined;
      if (!unsigned?.valid || !unsigned.value) return reply.redirect("/login?error=sso_state");
      const saved = JSON.parse(unsigned.value);
      reply.clearCookie(COOKIE, { path: "/api/auth/oidc" });
      try {
        const cfg = await oidcConfig(ctx);
        const current = new URL(req.url, ctx.config.baseUrl);
        const tokens = await client.authorizationCodeGrant(cfg, current, {
          pkceCodeVerifier: saved.verifier,
          expectedState: saved.state,
          expectedNonce: saved.nonce,
        });
        const idc = tokens.claims()!;
        let claims: Record<string, unknown> = { ...idc };
        try {
          claims = { ...claims, ...(await client.fetchUserInfo(cfg, tokens.access_token, idc.sub)) };
        } catch {
          /* userinfo is optional */
        }
        const groups = ((claims[o.groupsClaim] as string[]) ?? []).map(String);
        if (o.allowedGroups.length && !groups.some((g) => o.allowedGroups.includes(g))) {
          return reply.redirect("/login?error=sso_not_allowed");
        }
        const username = String(claims[o.usernameClaim] ?? claims.email ?? idc.sub);
        await ctx.loginExternal!(
          {
            source: "oidc",
            externalId: String(idc.sub),
            username,
            displayName: String(claims.name ?? username),
            email: claims.email ? String(claims.email) : undefined,
            isAdmin: groups.some((g) => o.adminGroups.includes(g)),
          },
          reply,
        );
        return reply.redirect("/");
      } catch (e) {
        ctx.log(`OIDC callback failed: ${(e as Error).message}`);
        return reply.redirect("/login?error=sso_failed");
      }
    });
  },
  checks: [
    {
      id: "oidc-discovery",
      name: "OIDC provider reachable",
      needsDb: false,
      async run(ctx) {
        const o = ctx.config.oidc;
        if (!o.enabled) return { status: "skip", detail: "OIDC is turned off." };
        if (!o.issuer) return { status: "skip", detail: "No issuer URL set." };
        if (!o.clientId || !o.clientSecret) return { status: "fail", detail: "OIDC client ID or secret missing." };
        try {
          const url = new URL(".well-known/openid-configuration", o.issuer.endsWith("/") ? o.issuer : o.issuer + "/");
          const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!r.ok) return { status: "fail", detail: `${url} returned HTTP ${r.status}.` };
          const doc = (await r.json()) as { issuer?: string };
          return { status: "ok", detail: `Discovery OK, issuer ${doc.issuer}.` };
        } catch (e) {
          return { status: "fail", detail: `Cannot reach ${o.issuer}: ${(e as Error).message}` };
        }
      },
    },
  ],
};

export default mod;
