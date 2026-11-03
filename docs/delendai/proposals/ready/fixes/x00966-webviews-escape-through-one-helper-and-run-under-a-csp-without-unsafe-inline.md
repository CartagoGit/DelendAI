---
id: x00966
title: "Webviews escape through one helper and run under a CSP without unsafe-inline"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 8872e394-2b88-489a-ad53-0de179fecda3
last-correlation-id: 8872e394-2b88-489a-ad53-0de179fecda3
last-transition-from: review
last-transition-at: 2026-11-03T19:43:06.207Z
shipped-in:
  - "3e8b12e7d"
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
- **Files**: `packages/ui-extension/src/dashboard/format.ts`, `packages/ui-extension/src/dashboard/render-output-schema.ts`, `extensions/vscode/src/views/render-output-schema.ts`, `extensions/vscode/src/webviews/setup-github.ts`, `extensions/vscode/src/dev/entry.ts`, `extensions/vscode/src/commands/types.ts`, `apps/shared/src/public/index.ts`, `packages/ui-extension/src/dashboard/format.ts`, `extensions/vscode/src/commands/types.ts`
- **Gate**: type
- acceptance:
  - "Every renderer imports the one escapeHtml, defined in `@delendai/shared` and re-exported by ui-extension, which escapes & < > " and '; no second definition remains in a renderer (G42). The extension scaffold's generated template keeps its own, since it writes into a project with no dependency on these packages. `extensions/vscode/src/dev/entry.ts`, the local development harness that is not shipped, keeps its own too."
- shipped-in: `87cdd379e676`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — WHAT IS WRONG: two renderers still define their own escape helper, so the slice's own criterion ("no second definition remains in a renderer", G42) does not hold at HEAD.

WHERE:
- apps/shared/src/components/ui/tabs.ts:81-87 defines `escapeText` beside the import of the shared helper it should use (the same file imports escapeAttr from ../../lib/escape at :50). It escapes the five characters, but it is a second definition in a renderer, which is what the criterion forbids, and it will drift from the shared one the moment the shared set changes.
- extensions/vscode/src/views/metrics-sparkline.ts:85-90 defines `escapeXml`, which escapes only & < > " and NOT the single quote, and uses it at :34 to build the aria-label attribute. This is precisely the shape G42 names: a second escape definition in a renderer that does not escape the single quote.

HOW TO REPRODUCE: grep -n "const escape" apps/shared/src/components/ui/tabs.ts extensions/vscode/src/views/metrics-sparkline.ts -> two definitions outside the two the criterion exempts (the extension scaffold template and extensions/vscode/src/dev/entry.ts). Compare with the canonical helper: apps/shared/src/lib/escape.ts:39-51 escapes & < > " and '.

WHAT MUST HOLD: every renderer imports the one escapeHtml from @delendai/shared (re-exported by ui-extension), which escapes all five characters, and no second escape definition remains in a renderer anywhere in the tree. The two exemptions the criterion names stay as they are; every other definition goes, including escapeText in tabs.ts and escapeXml in metrics-sparkline.ts. A spec that asserts the canonical helper escapes the single quote and that no renderer defines its own would keep it true.

### S2 — CSP without unsafe-inline, built safely
- **Status**: pending
- **Files**: `packages/ui-extension/src/webview/csp.ts`, `packages/ui-extension/src/webview/index.ts`, `packages/ui-extension/tests/webview/csp.spec.ts`, `extensions/vscode/src/contracts/constants/webview-message-schemas.constant.ts`, `extensions/vscode/src/test/webview-message-schemas.spec.ts`, `extensions/vscode/src/test/webview-csp.spec.ts`, `extensions/vscode/src/commands/open-knowledge.ts`, `extensions/vscode/src/commands/open-settings.ts`, `extensions/vscode/src/commands/open-toolbar.ts`
- **Gate**: type
- acceptance:
  - "Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17)."
  - "The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45)."
  - "Every webview message handler validates with safeParse against its schema (G11)."
- shipped-in: `96003045314a`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: requested_changes by minimax-m3.1-flash — WHAT IS WRONG: the slice's first criterion ("Webview scripts load with a nonce and script-src has no 'unsafe-inline'", D17) holds only for the five surfaces the override map names, while three shipped webviews that carry an inline <script> run under no Content-Security-Policy at all, and one webview message handler never validates what it receives (G11).

WHERE:
- extensions/vscode/src/webviews/setup-github.ts:128 renders an inline <script>; the panel is created with { enableScripts: true } at extensions/vscode/src/commands/setup-github.ts:45 and its html is assigned raw at :47, with no withCsp(...) and no injectCspMeta. Nothing in that file mentions a CSP.
- extensions/vscode/src/views/agent-catalog-webview.ts:156 renders an inline <script>; the panel is created with { enableScripts: true } at extensions/vscode/src/commands/open-agent-catalog.ts:139 and the html comes from loadCatalogHtml (:58-70) with no CSP.
- packages/ui-extension/src/kpi-dashboard.ts:471 defines CLIENT_SCRIPT and injects it at :760; the KPI view is filled at extensions/vscode/src/providers/kpi-dashboard-provider.ts:877 with setHtml(renderKpiDashboard(...)) and no CSP.
- extensions/vscode/src/commands/open-plugin-config.ts:150 registers a second webview message listener that discards the payload with `void raw` and never parses it; the listener at :155 validates with CONFIGURATION_CENTER_MESSAGE_SCHEMA.safeParse, so the panel validates in one listener and not in the other.

HOW TO REPRODUCE: grep -n "<script" extensions/vscode/src/webviews/setup-github.ts extensions/vscode/src/views/agent-catalog-webview.ts packages/ui-extension/src/kpi-dashboard.ts -> three script-bearing surfaces; grep -rn "withCsp(" over those files and their command boundaries -> none of the three is covered. grep -n "onDidReceiveMessage" extensions/vscode/src/commands/open-plugin-config.ts -> two listeners, the first at :150 without safeParse.

WHAT MUST HOLD: every shipped webview that carries a script runs under a Content-Security-Policy whose script-src names a per-document nonce and never 'unsafe-inline' -- the five surfaces in WEBVIEW_CSP_OVERRIDES already do, and setup-github, agent-catalog and the KPI dashboard must join them (a nonce per document, as SCRIPT_NONCE already provides). And every webview message handler validates what it receives with safeParse against its schema, so no listener is left taking a payload it never checks. A spec that asserts each script-bearing webview's html carries script-src with a nonce and no 'unsafe-inline' would pin it.

### S3 — Trailers are serialised
- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/audit/trailer.ts`, `plugins/commit-policy/tests/src/lib/audit/trailer.spec.ts`
- **Gate**: type
- acceptance:
  - "body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09)."
- shipped-in: `b17cfeae1abf`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 3e8b12e7d, validate exit 0 and tests 10/10 claimed, no recorded run cited; acceptance 1/1: (1) plugins/commit-policy/src/lib/audit/trailer.ts:134-141 serialises each value of the body-metadata trailer with JSON.stringify before interpolating it into the … — Approved at 3e8b12e7d on the delivered state of the commit-policy trailer, verified in the pack worktree against origin/develop. Type gate: bun run typecheck exited 0 for the pack unit. Slice specs: trailer.spec.ts, 1 file / 10 tests, exit 0. Acceptance 1/1: the body-metadata trailer serialises every value with JSON.stringify, and the spec writes a model name with a quote and asserts it round-trips.

## acceptance

- Every renderer imports the one escapeHtml, defined in `@delendai/shared` and re-exported by ui-extension, which escapes & < > " and '; no second definition remains in a renderer (G42). The extension scaffold's generated template keeps its own, since it writes into a project with no dependency on these packages. `extensions/vscode/src/dev/entry.ts`, the local development harness that is not shipped, keeps its own too.
- Webview scripts load with a nonce and script-src has no 'unsafe-inline' (D17).
- The meta tag escapes the header value; a spec with a quote in a source does not break the attribute (D45).
- Every webview message handler validates with safeParse against its schema (G11).
- body-metadata uses JSON.stringify for each value; a model name with a quote round-trips (CP-09).
