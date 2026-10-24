---
id: x00966
title: "Webviews escape through one helper and run under a CSP without unsafe-inline"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
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
- **Status**: pending
- **Files**: `packages/ui-extension/src/dashboard/format.ts`, `packages/ui-extension/src/dashboard/render-output-schema.ts`, `extensions/vscode/src/views/render-output-schema.ts`, `extensions/vscode/src/webviews/setup-github.ts`, `extensions/vscode/src/dev/entry.ts`, `extensions/vscode/src/commands/types.ts`
- **Gate**: type
- acceptance:
  - "Every renderer imports the ui-extension escapeHtml, which escapes & < > " and '; no second definition remains (G42)."

### S2 — CSP without unsafe-inline, built safely
- **Status**: pending
- **Files**: `packages/ui-extension/src/webview/csp.ts`, `packages/ui-extension/src/webview/index.ts`, `packages/ui-extension/tests/webview/csp.spec.ts`
- **Gate**: type
- acceptance:
  - "Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17)."
  - "The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45)."
  - "Every webview message handler validates with safeParse against its schema (G11)."

### S3 — Trailers are serialised
- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`
- **Gate**: type
- acceptance:
  - "body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09)."

## acceptance

- Every renderer imports the ui-extension escapeHtml, which escapes & < > " and '; no second definition remains (G42).
- Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17).
- The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45).
- Every webview message handler validates with safeParse against its schema (G11).
- body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09).
