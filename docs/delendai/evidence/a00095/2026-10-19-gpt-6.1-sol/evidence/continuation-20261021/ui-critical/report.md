# Critical UI source review — reconstructed evidence

Source snapshot `26b442f8fa1e73e9583be5044b5ca557b59c8919`. Reviewer gpt-6.1-sol / Codex. Regenerated 2026-10-21 after scratch loss.

**20 selected files, 3,367 lines, fully read earlier in this same conversation.** Exact fixed-source blobs are freshly restored and hashed; coverage.json distinguishes those actual prior readings from bounded source rechecks performed during reconstruction. No second full reading or recovered old stdout is claimed. All twenty are byte-identical at `df29b656ca803d2c9e8b453092b4566b07c8ddb4` and `95841ce85b486112d049a6ad871d1612e4fcfd88` (40 comparisons).

Score **6.1/10 for the selected UI surface**. There are strong existing escaped renderers, strict message schemas, digest checks, durable-first settings writes and request-correlated standalone settings replies. Three distinct workflow defects remain in configuration pending edits, stale discard baseline and reason-dialog cancellation. Full UI inventory has 900 entries; 880 remain explicitly pending outside this selection.

## New probe execution

All five newly regenerated cases/control pass in one new execution, exit0 and empty stderr. The real emitted configuration script executes in a VM over minimal synthetic DOM/events: saveA contains only A, changing B during the request enables Save again, then ackA marks clean/disabled though B is visible and never sent. A fresh edit after acknowledgement correctly marks dirty.

The real registered plugin configuration command and real strict message schema execute over synthetic read/save/render ports: open digestA, successful save acknowledgement digestB, then discard restores original HTML/digestA, with one document read. This isolates the handler baseline; it is not an actual persistence test.

The actual registered pause handler executes over synthetic dialog/client ports: reason cancel sends one captured state request; initial picker cancel sends zero. No provider, subprocess, real healthcheck, MCP, configuration/settings/memory write, browser or VS Code runtime is started. Resume shares the helper but is only statically traced.

The original scratch logs were lost. Only newly generated probe.ts, probe-result.jsonl, probe-stderr.log and verification.json are supplied; no lost earlier output is manufactured. Command: `bun ui-critical/probe.ts`. No full test suite/validate was rerun for this read-only source review.

## Findings

| ID | Severity | Finding |
|---|---|---|
| UI-CFG01 | P2 | A save acknowledgement clears edits made after its request was sent |
| UI-CFG02 | P2 | Plugin configuration discard restores the opening snapshot after a successful save |
| UI-ACTION01 | P2 | Canceling the provider reason dialog still changes the provider state |

Each record has seventeen populated fields, including exact real excerpts, explicit status, regressionTest, expected/actual behavior, cause, correction, own verification and limits. Compared with the current own index105: no same root cause found. Existing G11, D17, D45 and UI-01 are linked without inflating new finding count. CLI-OFFER01 is a different cancellation flow.

## Per-source assessment

| Source | Prior actual reading | Assessment |
|---|---:|---|
| `packages/ui-extension/src/components/host-bridge.ts` | 1–82 | Constant bridge dispatches action/open-tool/open-proposal messages; no new mismatch confirmed. Browser/API composition not executed. |
| `packages/ui-extension/src/components/runtime.ts` | 1–255 | Delegated runtime handles dropdowns, language, toasts, detail links and refresh. Full host/browser lifecycle not executed. |
| `packages/ui-extension/src/webview/csp.ts` | 1–145 | Existing D17 inline-script exceptions and D45 raw attribute interpolation persist; authored current tokens are constants. Not counted as new findings. |
| `packages/ui-extension/src/webview/index.ts` | 1–152 | Browser-safe barrel separates client value imports. Transitive renderers/build are outside this twenty-source reading claim. |
| `packages/ui-extension/src/configuration-center/configuration-center-model.ts` | 1–307 | Model projects schema/document/plugin/provider/artifact state and fallback copy; no new issue confirmed, no whole-config privacy claim. |
| `packages/ui-extension/src/configuration-center/configuration-center-fields.ts` | 1–149 | Derives supported scalar/enum/object fields and preserves unknown JSON. Unsupported schema projections are explicit, not assumed complete JSON Schema support. |
| `packages/ui-extension/src/configuration-center/configuration-center-script.ts` | 1–127 | UI-CFG01: newly executed emitted script clears post-request edits and enables Save during a pending request. |
| `packages/ui-extension/src/configuration-center/render-configuration-center.ts` | 1–267 | Escapes field/attribute values and emits typed paths. Controls remain editable while saving; contributes source trace to UI-CFG01. |
| `packages/ui-extension/src/settings/render-settings.ts` | 1–227 | Settings client has requestId/pending acknowledgement guards. Post-request field-edit UX requires independent browser testing; no duplicate untested finding. |
| `packages/ui-extension/src/settings/settings-schema.ts` | 1–47 | Validates typed URL/boolean/enums with language/motion defaults. Contextual URL semantic service is outside selected scope. |
| `extensions/vscode/src/commands/open-configuration-center.ts` | 1–292 | Uses shared digest-aware save helper and disposed guards. General discard reloads via renderPanel, positive counterevidence against a universal stale-discard claim. |
| `extensions/vscode/src/commands/open-settings.ts` | 1–313 | Durable state update precedes cache update; compatibility language mirror failure is deliberately tolerated. RequestId replies match requests. Multiple-panel concurrency untested. |
| `extensions/vscode/src/commands/open-plugin-config.ts` | 1–184 | UI-CFG02: initial HTML reused after successful save and digest update. Also default language/first workspace selection noted without new untested finding. |
| `extensions/vscode/src/commands/provider-actions.ts` | 1–365 | UI-ACTION01: reason cancellation proceeds; picker cancellation control aborts. Usage-clear modal requires explicit accepted action; no actual provider or log operation. |
| `extensions/vscode/src/contracts/constants/configuration-center-message-schema.constant.ts` | 1–35 | Strict bounded command/edit schema and digest shape. Semantic path persistence checks live outside this UI validator. |
| `extensions/vscode/src/contracts/constants/dashboard-message-schema.constant.ts` | 1–108 | Strict request/host discriminants and enums; model payloads unknown by design. Does not prove every extension webview validates consistently. |
| `extensions/vscode/src/views/tool-detail-webview.ts` | 1–84 | Thin localized-copy/type adapter delegates shared tool-detail rendering. Actual detail renderer/browser outside this selection. |
| `extensions/vscode/src/views/proposal-detail-webview.ts` | 1–75 | Thin proposal adapter with some explicitly English-only plan/progress labels. No new mismatch confirmed. |
| `extensions/vscode/src/commands/memory-forget.ts` | 1–40 | Requires a nonempty note id, reports explicit success/failure and refreshes tree. No real memory deletion. |
| `extensions/vscode/src/commands/plugin-activation.ts` | 1–113 | Uses overview activation model, selected origin/nextActive and optional restart. First-workspace/multi-workspace behavior not runtime tested. |

## Score and remaining limits

Architecture/contracts 7; correctness 5; asynchronous state handling 4; user intent/recovery 5; boundary validation 7; maintainability 7; testability 8. Mean 6.1/10. This is a narrow selected-source score, not whole product or browser acceptance.

pending.json freshly reconstructs the exact 880 nonselected paths. Retained opaque fixture dependencies receive no extra reading credit. Browser lifecycle, all transitive shared renderers, actual multi-workspace routing and full suites remain pending. coverage.json, source-hashes.json, delta-equality.json, dedup.json/index and verification.json preserve those distinctions. finalize.py verifies fixed source bytes and regenerates this report without repository/product changes.
