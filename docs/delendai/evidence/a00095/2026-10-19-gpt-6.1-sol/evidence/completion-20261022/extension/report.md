# Completed extension/shared family review

The family is exhausted at snapshot `95841ce85b486112d049a6ad871d1612e4fcfd88`: all 420 Git files are accounted for, with full textual reading of 419 files and structural verification of the one binary WOFF asset. This covers 61,519 inventoried lines across packages/ui-extension (120 files), extensions/vscode (199), and apps/shared (101). No authored source, declaration, test, fixture, stylesheet, dictionary or manifest remains pending. `coverage.json` records each path, SHA256, complete read range, method, individual verdict and executed-spec evidence. This is a complete family review, not a repository-wide completion claim.

`reconciliation.json` independently compared all 420 current worktree file SHA256s against the frozen inventory: 420 matches, zero differences after integration at e1662ab (develop60c3ebc merged). Prior full-read credit was reused for19 files only after exact hash equality; all23 declaration files were actually read, not labeled generated to avoid reading them. The binary N/A is source-text applicability only: WOFF declares996 bytes and11 tables, FontTools sees two glyphs and U+E000→logo-mono consistent with the manifest and generator. Its two-extra-bytes post.stringData warning is preserved as a structural observation, without inventing an icon rendering failure.

## Confirmed causes and existing finding extensions

`findings.json` contains five records, each with18 fields and exact source quotations:

| Record | Priority | Evidence and opinion |
|---|---|---|
| UI-ROUTE01 | P2 | Actual VS Code activation using fake ports requests the retired router name; actual core registration exposes the current compact router. Direct overview succeeds. Resolve the host routing contract instead of adding old aliases or guessing hidden-tool existence. |
| UI-PREF01 | P2 | Actual generated dashboard and native Chrome events change visual theme/language but emit old system/en form values. Synchronize one preference draft and submit chosen values. |
| UI-LOG01 | P3 | Native Chrome's first Start realtime click emits stop because initial paused=false contradicts the initial paused presentation. |
| UI-LOG02 | P2 | Actual sidebar provider + LogsService make another subscribe request after disposal. Empty streams have no event-count termination; view disposal never aborts its controller. Fix lifecycle ownership. |
| UI-I18N01 | P2 | Ten raw extension dictionaries each lack180 of241 English keys. The actual --strict gate nevertheless exits0 with12×241 complete because runtime English fallback filled the keys before checking. Preserve fallback and validate raw dictionaries. |

UI-I18N01 is a causal extension of prior G8, not a second generic count of missing translations. `dedup-mapping.json` compares all five causes and four existing records against the own108 index and relevant entries from the current prior284-row ledger. The task's earlier283 shorthand is superseded by the observed local284 count; no new blanket verification of unrelated prior rows is claimed.

`existing-findings-addenda.json` extends indexed UI-01 with actual Chromium evidence: tool detail raises `DEFAULT_TOOL_DETAIL_COPY is not defined`, proposal detail raises `renderCards is not defined`; both overlays remain hidden/empty. A native Tools-tab click succeeds as a positive event-control. This confirms that serialization drops lexical dependencies, while imported-function tests can pass. The broker suppresses standalone fallback after successful message delivery without a rendering acknowledgement. This is an extension of UI-01, not a sixth new finding.

Existing UI-CFG01/02 and UI-ACTION01 remain separate causes. Their relevant sources were fully read and exact prior hashes compared. Current passing specs do not disprove them: configuration save tests exercise supplied host messages, the plugin-discard spec compares the same old HTML string without checking the saved baseline, and the provider-reason fixture supplies a reason instead of returning cancellation. Previously preserved VM/fake-host reproductions are retained; this completion does not relabel them as newly rerun browser/host tests.

## Executed verification

All runs use owned fixtures/fake ports. Canonical compute-lock wrapper output is retained.

| Execution | Result | Evidence |
|---|---:|---|
| bun run test packages/ui-extension |38 files /258 tests passed | ui-tests.log |
| Extra colocated UI specs through scratch config and the same compute wrapper |2 files /8 tests passed | ui-extra-tests.log; ui-extra.vitest.config.ts |
| bun run test extensions/vscode |67 files /321 tests passed | vscode-tests.log |
| bun run test apps/shared |15 files /128 tests passed | shared-tests.log |

Total:122 spec files /715 tests passed. The extra two UI specs are outside that package's normal tests/** include; their separate execution avoids silently claiming the normal command covered them. The first extra-spec launch could not find vitest on PATH; invoking the installed vitest module through Bun corrected it. The final log includes the existing Vite config-loader compatibility warning and passes. No source fix or dependency install was required.

The real Chrome probe uses the actual rendered dashboard, compiled SCSS, native DOM events and fake acquireVsCodeApi capture, served as an offline file with about:blank documentation, background networking disabled, DNS denied and a disposable profile. It is not a real VS Code webview acceptance run. Chrome stderr includes routine DBus/background messages and is retained. `dashboard-browser.results.json` is the extracted result; the complete final DOM and fixture are retained for replay.

The actual activate/deactivate routing probe injects a client and command/UI ports so no process, provider, credentials or workspace is touched. The actual core registration function supplies the router-name countercheck. The view-disposal probe deliberately returns empty fake log batches; after observing the post-dispose poll it sends stop and awaits cleanup. The i18n probe loads actual raw dictionaries; the real strict gate is run unchanged. No provider healthcheck/invocation, real credential discovery, billable model, real configuration save, Git ref mutation, installed editor session or network service is exercised.

The Electron benchmark code and its complete fixture/integration runner were read. Its mocked summary/decision specs pass. The official Electron download/launch was not run, so actual activation time, VS Code command acceptance and host resource behavior remain unmeasured. The integration runner still requires dist/extension.js to inspect runtime work even though production build now emits under build/extensions/vscode; failure is converted to zero work units. Missing-call evidence already prevents a strong decision. This is supporting static review, not a fresh measured activation finding.

## Positive and negative evidence

The normal extension lifecycle tracks disposables, closes late clients and drains the runtime handle in reverse order while isolating cleanup failures; current lifecycle specs pass. This supports the scoped part of G17 and does not prove per-view cleanup, which UI-LOG02 specifically contradicts. Trust/launch gating uses stable fingerprints of command, ordered args and cwd; cancellation and changed launch paths have explicit fake-port coverage. No automatic real server launch was performed.

Configuration commands validate message contracts, schema-edit values and expected digests; conflict/no-op/error fixtures use temporary directories and actual configuration helpers. Standalone preferences have requestId acknowledgement/error handling, a useful stronger protocol for UI-CFG01. Toolbar dispatch is allowlisted. Manual Knowledge checks constrain command/id and use textContent; a different parser style alone does not establish the broad G11 defect. JSON/read-only views deny scripts and escape their displayed values; dashboard/toolbar inline-script overrides are explicit. D17 remains scoped policy debt, not proof of an active injection path.

Projection layers preserve recoverable malformed-board banners and explicit unavailable KPI states. Tests demonstrate cache TTL/invalidation and that filtering can reuse snapshots. A truncated tool list can be a discovery limitation, not proof a tool is absent. Actual core compact routing registration and visibility are kept distinct throughout this review. No token-savings or billed-cost accuracy conclusion is derived from display formatting tests.

The shared/color logo-mono.svg duplicates and source-authority ambiguity corroborate prior G72/G9. The WOFF generator actually consumes media/icons/logo-mono.svg, which uses currentColor: the colored duplicate is not its generator input. Historical mcp-vertex names in CHANGELOG remain history; current README apps/ide links and walkthrough assumptions lag the current package layout. These documentation observations are not counted as new runtime failures. (legacy audit quotation)

## Other static candidates and limits

The full read exposed additional observations that are intentionally not promoted to proven runtime findings: development previews insert dashboard body HTML with innerHTML (inline scripts are inert by browser rules), welcome Skip navigates to dashboard without changing unconfigured status, dashboard persisted theme/motion are not stamped on the initial html root, and desktop navigation/status selection can diverge. A scratch attempt to bundle the entire actual dev entry for a second browser experiment stopped on cross-spawn's bare child_process import; it did not reach browser execution. The production dashboard browser evidence above is successful and independent. These dev-preview observations remain static and were not used to expand confirmed finding counts.

The watcher declares extensions/client/src and extensions/ui-extension/src rather than the actual packages paths; the source was read, but no long-lived watcher experiment was launched. Proposal detail admits all proposal_transition log events in addition to task-matching events (the existing spec explicitly pins this), which merits a product decision about scoped history; no unrelated-user disclosure is asserted. Shared footer selectors/API URL composition, language-picker labels and the KPI discovery first100 heuristic likewise remain scoped static candidates pending a composed caller/browser/catalog case, with no claim of complete visual, native-language, keyboard or screen-reader acceptance.

No product/repository file was edited by this subagent. The deliverable is the frozen inventory, individual read/verification ledger, five18-field findings, existing UI-01 extension, causal dedup mapping, reproducible fixtures/results and report. Root owns canonical integration/publication and decides whether to continue into client/state/core after this reviewable checkpoint.
