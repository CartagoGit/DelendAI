---
id: f00544
title: "WordPress plugin covering self-hosted and WordPress.com SaaS"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00544 — WordPress plugin covering self-hosted and WordPress.com SaaS

## Goal

Provide the agent with tools to operate over WordPress sites: maintenance (core/plugin/theme updates), database (export/import/search-replace with mandatory dry-run), users, posts, options (with protectOptions double-confirmation), cron, debug, multisite, security audit, backup/restore (encrypted), migrate (dump + rsync + search-replace), and healthcheck. Multi-target connections: SSH, Docker Compose service, local, **and WordPress.com REST API (SaaS)**. Capabilities are auto-negotiated per plan; features unavailable in a plan degrade gracefully with an actionable error.

## why

WordPress site maintenance is a recurring real-world need (SiteGround, Bluehost, Cloudways, RunCloud, self-hosted LAMP). WordPress.com (SaaS) adds a different target with its own REST API and feature gating by plan. Both share the same domain and benefit from the same plugin with capability-aware tool exposure.

## non-goals

- No WYSIWYG content authoring.
- No theme or plugin development (that is P7).
- No deep WooCommerce operations beyond healthcheck.
- No automatic marketplace submission for plugins or themes.

## Slices

- global_gate: type

### S1 — Contract, connections, site detector
- **Status**: pending
- **Files**: `plugins/wordpress/contract.ts`, `plugins/wordpress/site-detector.ts`, `plugins/wordpress/connections/ssh.ts`, `plugins/wordpress/connections/docker-compose.ts`, `plugins/wordpress/connections/local.ts`, `plugins/wordpress/connections/wordpress-com.ts`, `plugins/wordpress/package.json`, `plugins/wordpress/tests/connections.spec.ts`
- **Gate**: type
- acceptance:
  - "Each connection respects the multi-target schema in delendai.config.json."
  - "Site-detector finds wp-config.php, WP-CLI binary (with version), and multisite config."
  - "WordPress.com connector negotiates capabilities based on plan (free, personal, premium, business, eCommerce)."

### S2 — Core, plugin, theme tools
- **Status**: pending
- **Files**: `plugins/wordpress/tools/core.ts`, `plugins/wordpress/tools/plugin.ts`, `plugins/wordpress/tools/theme.ts`, `plugins/wordpress/tests/core.spec.ts`, `plugins/wordpress/tests/plugin-theme.spec.ts`
- **Gate**: type
- acceptance:
  - "Each tool exposes a wp-cli invocation with structured output."
  - "Operations have a --dry-run path where applicable."
  - "Plugin activate or deactivate requires confirmation when the plugin is active on more than 10 sites (multisite case)."

### S3 — DB, user, post, option tools with safety guards
- **Status**: pending
- **Files**: `plugins/wordpress/tools/db.ts`, `plugins/wordpress/tools/user.ts`, `plugins/wordpress/tools/post.ts`, `plugins/wordpress/tools/option.ts`, `plugins/wordpress/tests/safety-guards.spec.ts`
- **Gate**: type
- acceptance:
  - "wp db query without --safe is blocked; queries must come from a whitelist or be tagged parameterized."
  - "wp search-replace runs --dry-run first and shows the diff before applying."
  - "Option update triggers double confirmation when the key matches protectOptions (siteurl, home, admin_email, db_*)."
  - "wp user reset-password never returns the password to stdout; it goes through a secure channel flag."

### S4 — Cron, debug, multisite tools
- **Status**: pending
- **Files**: `plugins/wordpress/tools/cron.ts`, `plugins/wordpress/tools/debug.ts`, `plugins/wordpress/tools/multisite.ts`, `plugins/wordpress/tests/cron-debug-multisite.spec.ts`
- **Gate**: type
- acceptance:
  - "cron list runs show next due time and recurrence."
  - "debug tail streams wp-content/debug.log without leaking DB credentials."
  - "multisite tools refuse to run against a non-multisite install."

### S5 — Security, backup, restore
- **Status**: pending
- **Files**: `plugins/wordpress/tools/security.ts`, `plugins/wordpress/tools/backup-restore.ts`, `plugins/wordpress/tools/security-audit.ts`, `plugins/wordpress/tests/security.spec.ts`, `plugins/wordpress/tests/backup-restore.spec.ts`
- **Gate**: type
- acceptance:
  - "security audit combines local static checks with the wordpress.org vulnerability API (when reachable)."
  - "backup writes tar.gz optionally encrypted with GPG using a configurable public key."
  - "restore verifies SHA256 and GPG signature before applying."

### S6 — Migrate and healthcheck
- **Status**: pending
- **Files**: `plugins/wordpress/tools/migrate.ts`, `plugins/wordpress/tools/healthcheck.ts`, `plugins/wordpress/tests/migrate.spec.ts`, `plugins/wordpress/tests/healthcheck.spec.ts`
- **Gate**: type
- acceptance:
  - "migrate combines dump + rsync + search-replace, always dry-run first."
  - "healthcheck runs verify-checksums, plugin status, db check, cron status, and signature scan."

### S7 — Documentation and worked examples
- **Status**: pending
- **Files**: `docs/delendai/wordpress-plugin.md`, `docs/delendai/wordpress-plugin-examples.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "Plugin docs cover every domain tool with at least one example."
  - "Examples cover: SSH self-hosted site, Docker Compose dev stack, WordPress.com free plan."

## acceptance

- Each connection respects the multi-target schema in delendai.config.json.
- Site-detector finds wp-config.php, WP-CLI binary (with version), and multisite config.
- WordPress.com connector negotiates capabilities based on plan (free, personal, premium, business, eCommerce).
- Each tool exposes a wp-cli invocation with structured output.
- Operations have a --dry-run path where applicable.
- Plugin activate or deactivate requires confirmation when the plugin is active on more than 10 sites (multisite case).
- wp db query without --safe is blocked; queries must come from a whitelist or be tagged parameterized.
- wp search-replace runs --dry-run first and shows the diff before applying.
- Option update triggers double confirmation when the key matches protectOptions (siteurl, home, admin_email, db_*).
- wp user reset-password never returns the password to stdout; it goes through a secure channel flag.
- cron list runs show next due time and recurrence.
- debug tail streams wp-content/debug.log without leaking DB credentials.
- multisite tools refuse to run against a non-multisite install.
- security audit combines local static checks with the wordpress.org vulnerability API (when reachable).
- backup writes tar.gz optionally encrypted with GPG using a configurable public key.
- restore verifies SHA256 and GPG signature before applying.
- migrate combines dump + rsync + search-replace, always dry-run first.
- healthcheck runs verify-checksums, plugin status, db check, cron status, and signature scan.
- Plugin docs cover every domain tool with at least one example.
- Examples cover: SSH self-hosted site, Docker Compose dev stack, WordPress.com free plan.
