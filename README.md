<p align="center"><img src="assets/minerva-mark.svg" width="120" alt="Minerva"></p>

# Minerva

A modular, self-hosted knowledge base in the spirit of Confluence: spaces, a page tree, a
word-processor editor with a Markdown source view, page history, search, diagrams, themes and
single sign-on. Runs on Kubernetes from one container plus PostgreSQL.

## Features

- **Spaces and page trees** with drag-and-drop reordering, breadcrumbs, child pages.
- **Editor**: headings, colors, highlight, alignment, lists, task lists, tables, images, code blocks
  with highlighting, Mermaid diagrams. Switch to **Markdown** at any time (`Visual` / `Markdown`).
- **Page elements** (toolbar *Insert…* menu), each with a markdown form:

  | Element | Markdown |
  |---|---|
  | Table of contents (live list of the page's headings) | `{{toc}}` on its own line |
  | Child pages list | `{{children}}` on its own line |
  | Panel: note, tip, important, warning, caution | GitHub alerts: `> [!WARNING]` then `> text` lines (`INFO` = note, `DANGER` = caution) |
  | Expand section (collapsed when reading) | `<details>`, `<summary>Title</summary>`, blank line, body, blank line, `</details>` |
  | Status label (grey, blue, green, yellow, red, purple) | `{{status:green:Done}}`, also inside table cells |
- **History**: every publish is a version; view and restore old versions. Optimistic locking stops
  silent overwrites.
- **Search**: PostgreSQL full-text search with highlighted snippets.
- **Themes**: Daylight, Midnight, Rosewood, Nord, Solarized, High contrast.
  **Page width** (Narrow, Standard, Wide, Full width) and **spacing** (Compact, Comfortable,
  Spacious) per user.
- **Authentication**: internal accounts (argon2id), OpenID Connect (Authentik, Keycloak, Entra ID, ...),
  LDAP / Active Directory. Admin rights can follow IdP groups.
- **Modules**: auth providers, environment checks and features are modules; third-party modules load
  from `MINERVA_PLUGIN_DIR`.
- **Install checks**: the Helm chart refuses to install when the StorageClass, TLS secret or referenced
  secrets are missing, and a pre-install Job checks DNS, the certificate (host name, expiry) and the
  IdP/LDAP before anything changes. The same checks run under *Administration → System health*.

## Install with Helm

```bash
kubectl create namespace minerva
kubectl -n minerva create secret tls minerva-tls --cert=tls.crt --key=tls.key
# chart: minerva-<version>.tgz from https://github.com/uhlix-net/minerva/releases
helm install minerva https://github.com/uhlix-net/minerva/releases/download/v0.2.4/minerva-0.2.4.tgz \
  --namespace minerva \
  --set baseUrl=https://wiki.example.com \
  --set ingress.tls.secretName=minerva-tls
```

The first start creates the administrator `admin` / `admin` (`admin.*` values). See
[`charts/minerva/values.yaml`](charts/minerva/values.yaml) for OIDC, LDAP, storage and resources.

## Development

```bash
npm install
podman run -d --name minerva-pg -e POSTGRES_USER=minerva -e POSTGRES_PASSWORD=minerva -p 5432:5432 postgres:16
npm run dev:server   # API on :8080
npm run dev:web      # UI on :5173 (proxies /api)
```

Layout: `server/` (Fastify, TypeScript), `web/` (React, TipTap), `charts/minerva/` (Helm),
`deploy/` (site-specific values and the k3s HelmChart generator).

## Writing a module

A module is an ES module whose default export is a `MinervaModule` (see
[`server/src/modules/types.ts`](server/src/modules/types.ts)): an id, a kind (`auth`, `checks`,
`feature`), and any of `authProvider()`, `checks[]`, `register(ctx)` (add API routes).
