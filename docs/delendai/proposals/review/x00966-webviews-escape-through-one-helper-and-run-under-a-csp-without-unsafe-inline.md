---
id: x00966
title: "Webviews escape through one helper and run under a CSP without unsafe-inline"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 9f819b3a-ac78-4fc0-af88-d8097b942318
last-correlation-id: 9f819b3a-ac78-4fc0-af88-d8097b942318
last-transition-from: in-progress
last-transition-at: 2026-11-01T02:10:58.747Z
---

# x00966 — Webviews escape through one helper and run under a CSP without unsafe-inline

## goal

One escapeHtml (quotes included) serves the dashboard, the extension webviews and every renderer; the CSP meta is built with escaped attributes and no script-src unsafe-inline; webview messages are validated the same way everywhere; and commit trailers are serialised, not interpolated.

## why

Joint audit a00095. G42: escapeHtml exists six times and five of them do not escape the single quote. D17: the dashboard CSP and four other webviews allow script-src 'unsafe-inline'. D45: injectCspMeta interpolates the CSP header into an HTML attribute without escaping. G11: webview validation is inconsistent (some use safeParse, others cast). sol CP-09: the body-metadata trailer mode interpolates JSON without escaping host, model or format.

## non-goals

- VS Code behaviour defects (the vscode proposal).

## slices

- global_gate: type

### S1 — One escapeHtml
- **Status**: review
- **Files**: `packages/ui-extension/src/dashboard/format.ts`, `packages/ui-extension/src/dashboard/render-output-schema.ts`, `extensions/vscode/src/views/render-output-schema.ts`, `extensions/vscode/src/webviews/setup-github.ts`, `extensions/vscode/src/dev/entry.ts`, `extensions/vscode/src/commands/types.ts`, `apps/shared/src/public/index.ts`, `packages/ui-extension/src/dashboard/format.ts`, `extensions/vscode/src/commands/types.ts`
- **Gate**: type
- acceptance:
  - "Every renderer imports the one escapeHtml, defined in `@delendai/shared` and re-exported by ui-extension, which escapes & < > " and '; no second definition remains in a renderer (G42). The extension scaffold's generated template keeps its own, since it writes into a project with no dependency on these packages. `extensions/vscode/src/dev/entry.ts`, the local development harness that is not shipped, keeps its own too."
- shipped-in: `87cdd379e676`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — CSP without unsafe-inline, built safely
- **Status**: review
- **Files**: `packages/ui-extension/src/webview/csp.ts`, `packages/ui-extension/src/webview/index.ts`, `packages/ui-extension/tests/webview/csp.spec.ts`, `extensions/vscode/src/contracts/constants/webview-message-schemas.constant.ts`, `extensions/vscode/src/test/webview-message-schemas.spec.ts`, `extensions/vscode/src/test/webview-csp.spec.ts`, `extensions/vscode/src/commands/open-knowledge.ts`, `extensions/vscode/src/commands/open-settings.ts`, `extensions/vscode/src/commands/open-toolbar.ts`
- **Gate**: type
- acceptance:
  - "Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17)."
  - "The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45)."
  - "Every webview message handler validates with safeParse against its schema (G11)."
- shipped-in: `96003045314a`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Trailers are serialised
- **Status**: review
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/tests/src/lib/audit/trailer.spec.ts`
- **Gate**: type
- acceptance:
  - "body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09)."
- shipped-in: `b17cfeae1abf`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Every renderer imports the one escapeHtml, defined in `@delendai/shared` and re-exported by ui-extension, which escapes & < > " and '; no second definition remains in a renderer (G42). The extension scaffold's generated template keeps its own, since it writes into a project with no dependency on these packages. `extensions/vscode/src/dev/entry.ts`, the local development harness that is not shipped, keeps its own too.
- Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17).
- The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45).
- Every webview message handler validates with safeParse against its schema (G11).
- body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09).
