---
id: f00545
title: "Plugin authoring multi-platform with analyzer (WordPress, Joomla, Drupal, Magento 2, PrestaShop, custom PHP)"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00545 — Plugin authoring multi-platform with analyzer (WordPress, Joomla, Drupal, Magento 2, PrestaShop, custom PHP)

## Goal

Provide the agent with tools and knowledge to **develop plugins and extensions** for WordPress, Joomla, Drupal, Magento 2, PrestaShop, and custom PHP, and include a **PluginAnalyzer** that detects platform, capabilities, license type, and recommends which delendai tools (and external tools such as phpcs, composer-audit, semgrep, psalm, phpstan) apply to that specific plugin, whether free or paid. Support scaffolding, lint, headers, i18n, security audit, and packaging for each platform; for paid plugins include license scaffold and signed updates references.

## why

Many projects work with the same codebase type across platforms (WP, Joomla, Drupal, Magento, PrestaShop, custom PHP). Without a uniform abstraction, delendai would need N plugins per platform. The PluginAnalyzer is the user's explicit ask: delendai analyzes the plugin and decides which tools are needed. This makes delendai a true plugin-authoring assistant, not just a site operator.

## non-goals

- No automatic submission to wordpress.org, drupal.org, joomla.org, Magento Marketplace.
- No deep marketplace rule linting (e.g. VAT validation in PrestaShop).
- No paid license verification server; signed updates are an opt-in scaffold only.
- No multi-language rewriting: lints and scaffolds only.

## Slices

- global_gate: type

### S1 — PlatformAdapter and PluginAnalyzer contracts
- **Status**: pending
- **Files**: `plugins/plugin-authoring/contract.ts`, `plugins/plugin-authoring/analyzer/contract.ts`, `plugins/plugin-authoring/analyzer/types.ts`, `plugins/plugin-authoring/registry.ts`, `plugins/plugin-authoring/package.json`, `plugins/plugin-authoring/tests/contract.spec.ts`
- **Gate**: type
- acceptance:
  - "IPlatformAdapter exposes detect, scaffold, lint, header get/set, packageForDistribution, i18n, securityAudit, registerTools."
  - "IPluginAnalyzer exposes analyze, recommendTools, recommendExternalTools."
  - "PluginAnalysis, ToolRecommendation, ExternalToolRecommendation types defined."

### S2 — WordPress PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/wordpress/index.ts`, `plugins/plugin-authoring/platforms/wordpress/scaffold.ts`, `plugins/plugin-authoring/platforms/wordpress/lint.ts`, `plugins/plugin-authoring/platforms/wordpress/header.ts`, `plugins/plugin-authoring/platforms/wordpress/i18n.ts`, `plugins/plugin-authoring/platforms/wordpress/security-audit.ts`, `plugins/plugin-authoring/platforms/wordpress/release.ts`, `plugins/plugin-authoring/platforms/wordpress/tests/wp.spec.ts`
- **Gate**: type
- acceptance:
  - "WPPB, simple, and custom profiles are scaffold templates."
  - "lint wraps phpcs with WordPress-Extra standard; auto-fix is opt-in."
  - "release produces zip with plugin-slug/ root, optional signature, and a SHA256SUMS file."
  - "readiness checker validates readme.txt against wordpress.org schema."

### S3 — Joomla PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/joomla/index.ts`, `plugins/plugin-authoring/platforms/joomla/manifest.ts`, `plugins/plugin-authoring/platforms/joomla/lint.ts`, `plugins/plugin-authoring/platforms/joomla/release.ts`, `plugins/plugin-authoring/platforms/joomla/tests/joomla.spec.ts`
- **Gate**: type
- acceptance:
  - "Manifests validated against Joomla XSD."
  - "Lint uses Joomla coding standards."
  - "Release zip follows Joomla extension packaging rules."

### S4 — Drupal PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/drupal/index.ts`, `plugins/plugin-authoring/platforms/drupal/info-yml.ts`, `plugins/plugin-authoring/platforms/drupal/lint.ts`, `plugins/plugin-authoring/platforms/drupal/release.ts`, `plugins/plugin-authoring/platforms/drupal/tests/drupal.spec.ts`
- **Gate**: type
- acceptance:
  - "info.yml validated against Drupal schema."
  - "Lint uses drupal/coder ruleset."
  - "Release produces a tar.gz suitable for drupal.org (no composer.lock)."

### S5 — Magento 2 PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/magento2/index.ts`, `plugins/plugin-authoring/platforms/magento2/composer.ts`, `plugins/plugin-authoring/platforms/magento2/module-xml.ts`, `plugins/plugin-authoring/platforms/magento2/lint.ts`, `plugins/plugin-authoring/platforms/magento2/release.ts`, `plugins/plugin-authoring/platforms/magento2/tests/magento2.spec.ts`
- **Gate**: type
- acceptance:
  - "composer.json validated against Magento 2 module conventions."
  - "registration.php and module.xml generated correctly."
  - "Marketplace-ready zip excludes composer-include and vendor/."

### S6 — PrestaShop PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/prestashop/index.ts`, `plugins/plugin-authoring/platforms/prestashop/scaffold.ts`, `plugins/plugin-authoring/platforms/prestashop/lint.ts`, `plugins/plugin-authoring/platforms/prestashop/release.ts`, `plugins/plugin-authoring/platforms/prestashop/tests/prestashop.spec.ts`
- **Gate**: type
- acceptance:
  - "Scaffold emits the standard hooks, controllers, views tree."
  - "Lint uses PrestaShop coding standards."
  - "Release zip follows PrestaShop addon rules."

### S7 — Custom PHP PlatformAdapter
- **Status**: pending
- **Files**: `plugins/plugin-authoring/platforms/custom-php/index.ts`, `plugins/plugin-authoring/platforms/custom-php/composer.ts`, `plugins/plugin-authoring/platforms/custom-php/lint.ts`, `plugins/plugin-authoring/platforms/custom-php/tests/custom-php.spec.ts`
- **Gate**: type
- acceptance:
  - "composer.json with sensible defaults (PSR-4 autoload, scripts for test)."
  - "Lint uses PSR-12 standard."
  - "Static analysis hook for psalm or phpstan."

### S8 — PluginAnalyzer core
- **Status**: pending
- **Files**: `plugins/plugin-authoring/analyzer/detect.ts`, `plugins/plugin-authoring/analyzer/metadata.ts`, `plugins/plugin-authoring/analyzer/risks.ts`, `plugins/plugin-authoring/analyzer/classify-license.ts`, `plugins/plugin-authoring/analyzer/recommend.ts`, `plugins/plugin-authoring/tools/analyze.ts`, `plugins/plugin-authoring/tools/recommend-tools.ts`, `plugins/plugin-authoring/tools/recommend-external-tools.ts`, `plugins/plugin-authoring/tests/analyzer.spec.ts`
- **Gate**: type
- acceptance:
  - "analyze() correctly identifies platform for fixtures of WP, Joomla, Drupal, Magento 2, PrestaShop, custom-PHP."
  - "metadata extraction captures hooks, db tables, REST routes, cron events."
  - "risks flags at least SQL injection, XSS, missing nonce, capability bypass, file inclusion, secret leak."
  - "recommend_tools emits a list with reason, estimated effort, priority."
  - "recommend_external_tools includes phpcs (per platform ruleset), composer-audit, semgrep, psalm or phpstan as applicable."

### S9 — Paid-plugin scaffolding (license + signed updates)
- **Status**: pending
- **Files**: `plugins/plugin-authoring/paid/license-scaffold.ts`, `plugins/plugin-authoring/paid/update-server-stub.ts`, `plugins/plugin-authoring/paid/signed-updates.ts`, `plugins/plugin-authoring/tests/paid.spec.ts`
- **Gate**: type
- acceptance:
  - "license scaffold emits an EDD-style or custom license checker template."
  - "update server stub generates a JSON endpoint shape compatible with WP update mechanism."
  - "signed-updates document how to sign a release and verify on the consumer side, with a worked example."

### S10 — Documentation: one guide per platform + analyzer guide
- **Status**: pending
- **Files**: `docs/delendai/plugin-authoring.md`, `docs/delendai/plugin-authoring-wordpress.md`, `docs/delendai/plugin-authoring-joomla.md`, `docs/delendai/plugin-authoring-drupal.md`, `docs/delendai/plugin-authoring-magento2.md`, `docs/delendai/plugin-authoring-prestashop.md`, `docs/delendai/plugin-authoring-custom-php.md`, `docs/delendai/plugin-authoring-analyzer.md`, `docs/delendai/plugin-authoring-paid.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "Each guide walks through scaffolding, linting, release in its platform."
  - "Analyzer guide explains output fields, risk severity, and how to act on tool recommendations."
  - "Paid guide covers both free (wordpress.org-style) and paid (license + signed updates) flows."

## acceptance

- IPlatformAdapter exposes detect, scaffold, lint, header get/set, packageForDistribution, i18n, securityAudit, registerTools.
- IPluginAnalyzer exposes analyze, recommendTools, recommendExternalTools.
- PluginAnalysis, ToolRecommendation, ExternalToolRecommendation types defined.
- WPPB, simple, and custom profiles are scaffold templates.
- lint wraps phpcs with WordPress-Extra standard; auto-fix is opt-in.
- release produces zip with plugin-slug/ root, optional signature, and a SHA256SUMS file.
- readiness checker validates readme.txt against wordpress.org schema.
- Manifests validated against Joomla XSD.
- Lint uses Joomla coding standards.
- Release zip follows Joomla extension packaging rules.
- info.yml validated against Drupal schema.
- Lint uses drupal/coder ruleset.
- Release produces a tar.gz suitable for drupal.org (no composer.lock).
- composer.json validated against Magento 2 module conventions.
- registration.php and module.xml generated correctly.
- Marketplace-ready zip excludes composer-include and vendor/.
- Scaffold emits the standard hooks, controllers, views tree.
- Lint uses PrestaShop coding standards.
- Release zip follows PrestaShop addon rules.
- composer.json with sensible defaults (PSR-4 autoload, scripts for test).
- Lint uses PSR-12 standard.
- Static analysis hook for psalm or phpstan.
- analyze() correctly identifies platform for fixtures of WP, Joomla, Drupal, Magento 2, PrestaShop, custom-PHP.
- metadata extraction captures hooks, db tables, REST routes, cron events.
- risks flags at least SQL injection, XSS, missing nonce, capability bypass, file inclusion, secret leak.
- recommend_tools emits a list with reason, estimated effort, priority.
- recommend_external_tools includes phpcs (per platform ruleset), composer-audit, semgrep, psalm or phpstan as applicable.
- license scaffold emits an EDD-style or custom license checker template.
- update server stub generates a JSON endpoint shape compatible with WP update mechanism.
- signed-updates document how to sign a release and verify on the consumer side, with a worked example.
- Each guide walks through scaffolding, linting, release in its platform.
- Analyzer guide explains output fields, risk severity, and how to act on tool recommendations.
- Paid guide covers both free (wordpress.org-style) and paid (license + signed updates) flows.
