# Minerva

Minerva is a modular, self-hosted wiki and knowledge base, in the style of Confluence. One container serves the web app and the API; PostgreSQL holds the pages.

## Features

- **Spaces and page trees** with drag-and-drop reordering, breadcrumbs and child pages
- **Editor**: rich text (headings, colors, tables, task lists, images, code blocks with highlighting, Mermaid diagrams), with a switch to **Markdown** at any time
- **Page elements**: table of contents, info/tip/warning panels, expand sections, status labels, child-page lists. Each has a markdown form (`{{toc}}`, `> [!WARNING]`, `<details>`, `{{status:green:Done}}`, `{{children}}`)
- **History**: every save is a version; view and restore old versions
- **Search**: PostgreSQL full-text search
- **Themes** (light, dark, high contrast) and per-user page width and spacing
- **Sign-in**: local accounts, OpenID Connect (Authentik, Keycloak, Entra ID, ...) and LDAP / Active Directory; admin rights can follow IdP groups
- **Health checks** for DNS, TLS certificate, database, storage and the IdP under *Administration → System health*

## Tags

| Tag | Meaning |
|---|---|
| `0.2.3`, `0.2.2`, ... | Release versions (recommended) |
| `latest` | Most recent release |

Images are `linux/amd64`, run as a non-root user (uid 10001) and listen on port **8080**.

## Quick start

```bash
docker network create minerva
docker run -d --name minerva-db --network minerva \
  -e POSTGRES_USER=minerva -e POSTGRES_PASSWORD=change-me -e POSTGRES_DB=minerva \
  -v minerva-db:/var/lib/postgresql/data postgres:16
docker run -d --name minerva --network minerva -p 8080:8080 \
  -e DATABASE_URL=postgres://minerva:change-me@minerva-db:5432/minerva \
  -e MINERVA_BASE_URL=http://localhost:8080 \
  -e MINERVA_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e MINERVA_ADMIN_PASSWORD=change-me \
  -v minerva-data:/data uhlix/minerva:0.2.3
```

Open http://localhost:8080 and sign in as `admin`. The admin account is created only when the database has no users.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://minerva:minerva@localhost:5432/minerva` | PostgreSQL connection |
| `MINERVA_BASE_URL` | `http://localhost:8080` | Public URL (used for SSO redirects and checks) |
| `MINERVA_SESSION_SECRET` | insecure dev value | **Set this.** Signs session cookies |
| `MINERVA_ADMIN_USERNAME` / `MINERVA_ADMIN_PASSWORD` | `admin` / `admin` | First administrator |
| `MINERVA_SITE_NAME` | `Minerva` | Name shown in the UI |
| `MINERVA_DATA_DIR` | `/data` | Attachments (mount a volume here) |
| `MINERVA_SESSION_DAYS` | `14` | Session lifetime |
| `MINERVA_MODULES` | `auth-local,auth-oidc,auth-ldap,checks-core,markdown-import` | Enabled modules |
| `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | — | OpenID Connect sign-in (also `OIDC_DISPLAY_NAME`, `OIDC_SCOPES`, `OIDC_ADMIN_GROUPS`, `OIDC_ALLOWED_GROUPS`) |
| `LDAP_URL`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_USER_BASE` | — | LDAP / AD sign-in (also `LDAP_USER_FILTER`, `LDAP_ADMIN_GROUPS`, `LDAP_CA_FILE`, ...) |
| `SMTP_HOST`, `SMTP_PORT` | —, `25` | Outgoing mail |

## Kubernetes

A Helm chart with install-time checks (StorageClass, TLS secret, DNS, certificate, IdP) is published with each release.
