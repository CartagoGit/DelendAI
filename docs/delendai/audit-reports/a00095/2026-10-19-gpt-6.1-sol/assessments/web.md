Evidence filenames in this dated report resolve inside ORIGINALS.tar.gz under evidence/completion-20261022/web/. Source/code claims retain their original snapshot and execution limits.

# Independent web continuation

Auditor: gpt-6.1-sol, Codex. Report recorded on 22 October 2026. Source snapshot: `95841ce85b486112d049a6ad871d1612e4fcfd88`.

The completed portion contains 220 authored files read in full, 115 static assets assessed individually by structure and provenance, and two generated catalogs assessed through their generator and complete value consistency. The inventory contains 480 tracked web files. The remaining 143 translation/content files were assigned to the separate translation reviewer; this report does not count them as read. `pending.json` identifies every remaining path. Combine that review with this ledger before closing the web family.

A separate Git-tree comparison against `60c3ebc41d5352fc8fe2f58f40505452ee265792` finds no blob change in any of these 337 completed paths. Only the translation registry and a new onboarding translation differ; those belong to the translation review. This is explicit byte parity, not a claim that every observation was rerun at the newer revision.

## Findings

`findings.json` and `findings.md` contain ten new bounded findings, each with exact source quotations, expected/observed behavior, cause, impact, proposed correction, regression scenario and limitations. Eight are P2 and two P3.

| Finding | Independent result |
| --- | --- |
| WEB-TABS01 | Real Chrome: rapid A → B → A leaves the selected panel hidden after an older fade callback runs. |
| WEB-TABS02 | Real Astro link navigation replaces the DOM without rebinding tabs/copy controls. Clicking Python afterward leaves its panel hidden. |
| WEB-SKILL01 | The real skill generator's 28 records render beneath the literal heading `undefined`, because the grid expects a missing `namespace` field. |
| WEB-TUTORIAL01 | The actual parity checker accepts English `wanted` plus Spanish `orphan` when counts match. |
| WEB-ASSET01 | An offline refresh deletes an existing logo in an owned fixture. |
| WEB-ASSET02 | An HTTP 200 HTML document is accepted as SVG and saved as a successful logo. |
| WEB-ROUTE01 | Localized home links include `/es/presets`, but only the English preset page is emitted. |
| WEB-A11Y01 | Enter opens settings while focus remains outside; Tab moves into background content. |
| WEB-CSS01 | The dropdown emits `nav__more` while its styles/mobile breakpoint expect `nav-more`. |
| WEB-GATE01 | `build:strict` invokes the translation checker without `--strict`; an owned missing-key fixture exits zero and prints both an incompleteness warning and a completeness message. |

No product fix or proposal-state change is included. Resolution is deferred to joint consensus.

## Existing joint findings and negative observations

G134 is strengthened, not duplicated: the browser reproduces duplicated base/locale segments in settings links and also finds `Base.astro` rewriting Spanish nav links to paths such as `/es/delendai/es/tools`. The existing source-only observation now has a real browser result with a controlled manifest. WEB-ROUTE01 is separate because the preset route remains absent even with a corrected base.

G137 remains supported: shared page shells and body-owned headings can produce multiple h1 elements, while canonical/alternate metadata remains explicit on the root route. No SEO ranking effect or historical full-catalog page count was measured.

G70 remains bounded: the event endpoint emits a static bootstrap, the logs page closes the source, and recovery reloads. These pages receive no live data in this static build; the page-audit data describing them as live is stale documentation, not another independent runtime defect.

G8/D11 localization gaps remain distinct from key parity. The actual strict checker reports 12 × 315 site keys, 12 × 546 shared keys, and en/es × 241 authored extension keys complete in this tree. A key-complete fallback dictionary does not establish translated prose. The intentionally English guide/CLI bodies have visible notices. Translation review covers the remaining authored dictionaries and markdown content.

G72 is independently unchanged for web assets: `logo.svg` and `logo-mono.svg` have the same SHA-256 `999423f52294a3a07ae0340695aa3fc467755defdbb020085da828a4d57b3636`. This report does not attribute that asset to an unrelated icon-font producer.

The provider page visibly labels its frozen showcase; it is not evidence of live quota or usage. No new fabricated-telemetry finding is promoted. Proposal status consumers normalize `in-progress` to the glossary's `in_progress`; that spelling difference is handled.

## Execution and limits

Dependencies were installed from the frozen lockfile and offline cache with lifecycle scripts disabled: 761 packages, approximately 851 ms. The isolated source archive and dependencies are outside the repository. Astro 7.3.1 built 317 pages in 7.50 seconds using actual unmodified components/routes and an explicit synthetic capabilities manifest. The pages/skills manifests were produced by their real local generators. This validates the renderer and route wiring; it does not certify a live MCP catalog or deployment.

Google Chrome 151.0.7922.75 ran headless against a loopback-only fixture server, with dedicated temporary profiles and external DNS disabled. The initial and additional scripts record actual navigation, clicks, key events, focus, computed layout and screenshots. A normal ArrowRight test correctly selects and shows the next tab. At widths 390, 768, 1024 and 1440 the nav and main did not overlap. The Spanish home nevertheless had horizontal overflow at the two smaller widths: scroll width 896 pixels, with marquee label/track descendants extending outside the viewport. That observation is retained without promoting an unproven sizing cause. Pagefind 1.5.2 indexed the controlled 317-page output, and its real search modal/input opened successfully. These are bounded browser checks, not exhaustive assistive-technology or browser-engine testing.

The preserved Vitest log reports 28 files and 257 tests passed. The attempted root `--exclude '**/gen-capabilities.spec.ts'` was **not effective in this execution**: the project still ran two tests that assembled the full plugin harvest. The invocation used an empty inherited environment and a disposable home, not private account configuration. No provider invocation or expenditure is shown in the captured output, but the run must not be described as a proven no-discovery execution. It was not repeated after recognizing this scope error. Do not reuse that command as an exclusion recipe. The browser build/captures preceded those tests and retain their explicit synthetic manifest.

The standalone strict i18n checker and JSX-literal scanner printed their success lines; their separate exit codes were not captured because the shell sequence returned only the final command status. The controlled missing-key subprocesses do have exact exit receipts: no strict flag → 0; strict flag → 1. The logo probes replace `fetch` before importing the actual unchanged entrypoint: no HTTP request occurs, and only owned fixture assets are written/deleted.

## Generated and static data

All 61 declarative plugin manifests were imported without registering plugins or assembling MCP. The real pure `buildManifestArtifact` reproduces all 58 public profile records exactly. All 58 data-catalog id/summary records match their computed inputs. Private manifests being absent from the public profile catalog is intentional. `generated-ledger.json` records the two files as generated-data reviews, not full authored source readings.

Every public asset has its own ledger row: 104 SVG files parsed structurally, ten binary image signatures checked, and one empty placeholder. The SVG scan found no script/foreignObject elements or external href/src targets. This does not claim a visual audit of every vector coordinate or third-party mark. The actual logo generator emitted 87 selected paths including the placeholder; those compare equal to committed bytes. Other assets were copied into that owned fixture and are explicitly marked as not produced by that generator, avoiding false provenance claims.

## Concurrent-write assessment

| Scenario | Existing mitigation | Gap or bounded result |
| --- | --- | --- |
| Two manifest generators target the same output | Canonical root workflows may serialize broader compute; outputs are regenerable | Individual web generators use ordinary writes, not a manifest transaction. No user-state corruption reproduction or new finding is claimed from the bare write alone. |
| Brand refresh fails before a replacement exists | Existing downloaded assets are available | Cleanup removes them anyway: WEB-ASSET01 reproduces the failure. |
| A panel is reactivated while an older fade is pending | UI has animation and fallback timers | Old callbacks are not causally invalidated: WEB-TABS01 reproduces the visible race. |
| A client navigation replaces control nodes | Controllers have idempotence markers | Their one-shot component callers do not initialize the new nodes: WEB-TABS02 reproduces it. |

## Evidence map

- `source-ledger.json`: all 220 full-read source files, complete ranges, hashes, individual scoped verdicts and finding links.
- `asset-ledger.json`, `generated-ledger.json`, `generated-consistency.json`: individually justified data/asset classifications and producer checks.
- `verification.json`: commands, observed outcomes and the test-scope limitation.
- `browser-*-result.json`, `browser-result.json`, `web-390.png`, `web-1440.png`: actual browser observations.
- `probe-*.ts`, their logs and `i18n-build-gate-result.json`: executable owned-fixture probes and controls.
- `snapshot-parity-958-to-60c.json`, `scope.json`, `pending.json`: exact revision and coverage boundaries.

The full-repository audit remains a separate task. This web result closes only the assigned completed paths and must be joined with the translation ledger before claiming complete web source coverage.
