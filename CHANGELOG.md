# Changelog

All notable changes to Minerva. Versions follow [semantic versioning](https://semver.org/).

## 0.3.0 (2026-11-22)

### Added
- **Settings → Authentication** (administrators): configure OpenID Connect and LDAP / Active Directory in the
  browser. Values start from the environment (Helm values and secrets); saving stores them in the database,
  where they override the environment, and they apply without a restart. *Use environment settings* goes back.
  Secrets are write-only. **Test** checks the connection (OIDC discovery, LDAP service-account bind) and, for
  LDAP, can try a real sign-in.
- **User Guide** (top bar): every markdown option and page element, with the markdown next to the rendered result.
- **Help** (top bar): version, what Minerva is, and the sign-in methods on this site.
- **Settings → Users** and **Settings → System Status** (health checks, modules) for administrators.
- `OIDC_ENABLED` and `LDAP_ENABLED` environment variables (default `true`).

### Changed
- Top bar: logo, Spaces, Create and Search on the left; Settings, User Guide, Help, appearance and account on
  the right.
- *Administration* moved from the account menu into Settings (Users, System Status). `/admin` and `/about`
  redirect.
- Table of contents title "Table of Contents" in the page H2 font.
- Auth modules register their routes even when not configured at startup, so a provider configured later in
  the UI works without a restart.
- Release workflow: pre-release tags (`v0.3.0-rc.1`) don't move the `latest` image tag and are marked as
  pre-releases on GitHub.

### Fixed
- Table of contents links scrolled the heading under the sticky breadcrumb bar (or the editor toolbar).
- Opening a page from the sidebar kept the previous page's scroll position instead of starting at the top.

## 0.2.5 (2026-11-22)
- Table of contents title in the H2 font. (0.2.4 used the H1 font.)

## 0.2.1 – 0.2.3 (2026-11-16)
- Table of contents and child pages box: transparent background, no border, flush with the page.

## 0.2.0 (2026-11-16)
- Page elements, each with a markdown form: table of contents `{{toc}}`, child pages `{{children}}`,
  panels (GitHub alerts `> [!NOTE]` … `> [!CAUTION]`), expand sections (`<details>`), status labels
  `{{status:color:Text}}`.
- Docker Hub image `docker.io/uhlix/minerva` and a synced Docker Hub overview.

## 0.1.0 (2026-11-16)
- First release: spaces and page trees, visual editor with a markdown view, version history, full-text search,
  themes, page width and spacing, local / OIDC / LDAP sign-in, modules, install-time checks, Helm chart.
