---
id: f00097
status: ready
type: proposal
kind: feat
track: vscode-host+ui-extension+proposals+apps-web+i18n
date: 2026-07-02
title: VS Code proposals board + detail webview (read-only observability)
shipped-in: []
recan: []
related:
    - f00069 # tabs cross-fade — S3 of this proposal reuses the `<Tabs variant="proposals">` pattern on the web parity route
    - f00084 # `init` command — S0 cross-references the proposals board the host already shows
    - f00094 # non-repo host-instructions audit — emits proposals of the same kind this proposal renders
    - f00090 # in-session context compaction — the board's cached projection reuses the `digest()` helper
ownership:
    - { agent: proposal_guardian,    task: "S1: decide the read-only surface. Lock the tool whitelist consumed by the VS Code host (proposals board, proposal diagnose, proposal transition log tail, logs tail filtered by proposal, state health). Reject any tool that mutates state from the UI." }
    - { agent: implementation_runner, task: "S2: add `extensions/vscode/src/views/proposals-board-view.ts` (sidebar TreeView) + a `IProposalsBoardProvider` that calls the proposals plugin's read-only tools via the stdio client, caches the snapshot in `context.globalState` under a stable key, and exposes refresh-on-focus via `onDidChangeWindowState`. Schema is consumed through `outputSchema.safeParse`, never hardcoded." }
    - { agent: implementation_runner, task: "S3: add `extensions/vscode/src/views/proposal-detail-webview.ts` — opens on click from the board; renders proposal frontmatter, slice owners, recent `proposal_transition` log entries, and a filtered `logs_tail` view. Reuses `render-output-schema.ts` and `escapeHtml` from the agent-catalog webview." }
    - { agent: implementation_runner, task: "S4: wire `mcp-vertex.openProposal` → board view selection; add `mcp-vertex.proposals.refresh` command (also bound to the existing `mcp-vertex.refresh` for parity). Update `package.json` `contributes.views` icon to use `media/logo.svg` (the activitybar container already references it). No new menu contribution until S5." }
    - { agent: implementation_runner, task: "S5: add web parity at `apps/web/src/pages/[lang]/proposals/index.astro` (Phase 1 of f00069 cross-fade reused) — same projection as S2/S3, no proposal mutation. Registers the page in `apps/web/src/data/pages/proposals/*.md` so `[page].astro` serves it. i18n keys added to every language in `apps/web/src/i18n/ui.ts`." }
    - { agent: delivery_verifier,    task: "S6: e2e spec using `@vscode/test-electron` + a stub stdio client that returns canned outputs for `mcp-vertex_proposals_proposal_board`, `_diagnose`, `_compact_status`, and `logs_tail`. Asserts (a) the board renders every status exactly once when the snapshot has one per family, (b) clicking a row opens the detail webview with the correct proposal id, (c) refresh-on-focus produces a fresh snapshot but does not refetch on every keystroke, (d) `outputSchema` violations in the stub are surfaced as a `recoverable` banner, not a crash." }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                 expect: exit0 }
    - { command: bun run lint,                      expect: exit0 }
    - { command: bun run lint:web,                  expect: exit0 }
    - { command: bun run lint:scss,                 expect: exit0 }
    - { command: bun run check:i18n,                expect: exit0 }
    - { command: bun run check:i18n:plugins,        expect: exit0 }
    - { command: bun run test,                      expect: exit0 }
    - { command: bun run validate,                  expect: exit0 }
    - { command: bun run catalog:check,             expect: exit0 }
    - { command: bun run catalog:hints:check,       expect: exit0 }
---

# f00097 — VS Code proposals board + detail webview (read-only observability)

## goal

Make the proposals workflow **observable from inside VS Code** without
opening a terminal: a sidebar **board** (status-filtered, text-filtered,
tag-filtered list of every proposal) plus a **detail webview** (per
proposal: slices with owners, diagnose summary, recent transitions, a
filtered `logs_tail` view, and the proposal's state in the swarm). All
read-only — the UI does not move proposals, does not claim slices, does
not transition state. Mutation stays in the agent / CLI where the lock
manager and `agent_lock` contract already enforce ownership.

A web parity route lives under `apps/web/src/pages/[lang]/proposals/`
so the same projection is consumable from the docs/product site, reusing
the cross-fade tabs from f00069.

The shape and size of the proposal lifecycle is **not** changed.
The board consumes the existing read-only tools that the proposals
plugin already publishes; no new mutation surface, no new persisted
state in the extension.

## why

1. **The activitybar container is reserved but empty.**
   `extensions/vscode/package.json` already declares
   `mcp-vertex.proposals` and the `mcp-vertex.openProposal` command.
   Operators who live in VS Code have a UI hook for "proposals" but
   no implementation behind it. Today the only path to "what is the
   status of f00097?" is the terminal.
2. **Proposals are already the single source of truth.** The proposals
   plugin owns the lifecycle, the locks, the diagnose pass, and the
   transition log. The host does not need to invent a parallel state
   machine — it just needs to project what the plugin already
   computed.
3. **Read-only is the right default for the UI.** Any UI that
   mutates proposal state has to coordinate with `agent_lock` (so two
   tabs do not race), with the transition DFA (so an invalid move is
   rejected), and with the branch / worktree gate (so the right
   worktree owns the file). None of that work has been done, and
   doing it without a real UX reason would expand the contract for
   no benefit.
4. **Schemas change every week.** A UI that hardcodes
   `{ status, slices, owners }` breaks the next time the plugin adds a
   field. The proposal plugin already publishes typed `outputSchema`
   per tool; the host consumes it via `safeParse` so adding a field
   is non-breaking.
5. **Web parity is cheap when the projection lives in one module.**
   `agent-catalog-webview.ts` and the `IProposalSummary` type are
   already shared between host and web. The proposals board reuses
   the same projection: one implementation, two renderers.
6. **Status-marker closure is observable too.** The detail webview
   shows the latest `status_marker_close` line for the slice owner
   (when available via `logs_tail`), so a reviewer can audit "did the
   last agent close with the right state?" without leaving VS Code.

## why this design

- **Read-only tool whitelist.** The board consumes only the proposals
  plugin's read-only tools — `proposal_board`, `proposal_diagnose`,
  `compact_status`, `logs_tail`, `state_health`, and `proposal_stale_list`.
  The detail webview consumes the same set scoped to one proposal id.
  The whitelist is documented at the top of the new view module as a
  TypeScript `const` so a reviewer can grep for "this is what the UI
  may call" without reading the whole file.
- **Snapshot caching in `context.globalState`.** Each refresh writes
  the parsed projection under a stable key
  (`mcp-vertex.proposals.snapshot`). The webview reads from cache
  on focus, fetches a fresh snapshot only when the cache TTL (default
  30 s) expires or the user clicks **Refresh**. No polling, no
  per-keystroke refetch.
- **`outputSchema.safeParse`, never names.** The proposals plugin's
  tool outputs are validated against their declared `outputSchema`
  before the UI projects them. Unknown fields pass through (forward
  compatible). Missing fields fall back to `recoverable` banner copy
  in the user's language (the i18n key `proposals.board.recoverable`
  is added in every locale).
- **No mutation in the UI.** `proposals_proposal_transition`,
  `agent_lock`, `close_slice`, `sync_proposals` — none of them are
  callable from the board or the detail webview. The verification
  step S6 asserts this by inspecting the implementation: the view's
  command palette includes only `openProposal`, `refresh`, and
  `copyProposalId`.
- **Web parity reuses the projection, not the host code.**
  `apps/web/src/pages/[lang]/proposals/index.astro` calls the same
  read-only tools via the SSR data layer and projects through the
  same TypeScript types as the host. `apps/web` already does this for
  the catalog and the plugins page; the proposals route joins the
  same pattern.

## non-goals

- **No mutation UI.** No buttons that transition status, no
  approve/reject buttons, no slice claim buttons. The CLI / agent
  owns the write path.
- **No inline edit of proposal markdown.** The detail webview shows
  the parsed frontmatter + slices as structured cards; it does not
  embed a markdown editor. The proposal file is opened in a normal
  editor tab on click.
- **No new read-only tool.** This proposal does **not** add a tool to
  the proposals plugin. Everything the UI needs is already exposed.
  If a field is missing, the gap is a separate proposal.
- **No cross-host parity.** Only VS Code + `apps/web` are in scope.
  Cursor, Aider, Continue parity is a future proposal (and depends on
  their webview capabilities, not on the read-only contract).
- **No realtime streaming.** No SSE, no live tail of `logs_tail`. The
  snapshot is point-in-time; refresh is explicit. The reason:
  `logs_tail` already produces a redacted snapshot suitable for
  projection; a live stream would need its own redaction channel.

## slices

### S1 — Read-only tool whitelist

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/ready/f00097-vscode-proposals-board-and-detail-webview.md`
  (this proposal), `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` (design note appended)
- **Agent**: proposal_guardian
- **Gate**: typecheck
- **Acceptance**:
  - "The design note in `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` documents
    the read-only tool whitelist consumed by the VS Code host, with a
    per-tool rationale."
  - "The whitelist is mirrored as a TypeScript `const READ_ONLY_TOOLS`
    in `extensions/vscode/src/views/proposals-board-view.ts`; mutating
    tool names are not present."

| Tool | Allowed in board | Allowed in detail | Notes |
|---|---|---|---|
| `proposal_board` | yes | yes (per-id filter) | The primary list source |
| `proposal_diagnose` | no | yes | Per-id only |
| `compact_status` (locks + queue + proposals fields) | yes (locks badge) | yes | Aggregated swarm health |
| `logs_tail` | no | yes (filtered by proposal) | Only the redacted tail is read |
| `state_health` | yes (header chip) | yes | Surfaces recovery hints |
| `proposal_stale_list` | yes (badge) | yes | Surfaces "stale > 7 d" |
| `proposal_transition` | **no** | **no** | Mutating; CLI/agent only |
| `agent_lock` | **no** | **no** | Mutating |
| `close_slice` | **no** | **no** | Mutating |
| `sync_proposals` | **no** | **no** | Mutating |

### S2 — Sidebar board view

- **Status**: done
- **Done note (2026-07-03)**: shipped by EVOLVING the existing
  `providers/proposal-board-provider.ts` (not a parallel provider), with the
  read-only data layer extracted to `lib/proposals-snapshot.ts`
  (`ProposalsSnapshotSource`: parallel `Promise.all` fetch of
  `proposal_board` + `compact_status` + `state_health` +
  `proposal_stale_list`, tolerant hand-rolled projection — the extension has
  no zod dep — TTL(30 s) cache + `invalidate()`). The provider now renders 4
  header chips + dynamic status-group roots (in a canonical rank order, built
  from the statuses the snapshot actually carries — `proposal_board` only
  surfaces `pending`/`ready`/`in_progress`, so absent groups are omitted, which
  is what S6 asserts) + leaves routing to `mcp-vertex.openProposal` + a
  `recoverable` banner with a `mcp-vertex.proposals.copyError` command. Filters
  (`status` + `text`) narrow WITHOUT refetching (served from cache) and persist
  via `host/proposal-filter-store.ts` (globalState). Tool calls route through
  S1's `READ_ONLY_TOOLS` + `formatToolName(namespacePrefix, …)`.
  **Deviations, deliberate:** (1) `views/proposals-board.css` was NOT created —
  a `TreeView` is theme-styled, not CSS-styled; the webview CSS lands in S3
  where it is actually consumed (avoids a dead file). (2) The `tag` filter is
  deferred: `proposal_board` carries no tags, so a tag filter would be inert;
  it returns with a board projection that includes tags (separate concern).
  (3) `refresh()` is exposed and fires `onDidChangeTreeData`; wiring it to
  window-focus + the `mcp-vertex.proposals.refresh` command is S4 (command
  wiring). Specs: rewrote `test/proposal-board-provider.spec.ts` (grouped
  structure, chips, filter-no-refetch, TTL, banner, aux-failure) + new
  `test/proposals-snapshot.spec.ts`; `proposals-view-registration.spec.ts`
  stays green. `tsc -p extensions/vscode` exit 0; 130 vscode specs green.
- **Reconciliation note (2026-07-03, S1 follow-up)**: this proposal's premise
  ("the activitybar container is reserved but empty") is now partly stale —
  **f00079 S4 already shipped** `extensions/vscode/src/providers/proposal-board-provider.ts`
  (`ProposalBoardProvider`), a flat `TreeDataProvider` over `proposal_board`
  with a plain invalidate-cache + `refresh()` and the `mcp-vertex.openProposal`
  wiring (covered by `test/proposal-board-provider.spec.ts` +
  `test/proposals-view-registration.spec.ts`). **S2 must EVOLVE that provider,
  not add a parallel `IProposalsBoardProvider`** (a second provider would be
  dead-code duplication). Concretely, S2 layers onto the existing provider:
  (a) status-GROUP roots instead of a flat list; (b) the four header chips
  (Locks/Stale/Queue/Health) sourced from `compact_status` + `state_health` +
  `proposal_stale_list`; (c) a TTL cache (30 s) + refresh-on-focus + persisted
  filters; (d) `outputSchema.safeParse` tolerance with the `recoverable`
  banner; (e) call sites go through `READ_ONLY_TOOLS` +
  `formatToolName(namespacePrefix, …)` (S1's whitelist in
  `views/proposals-board-view.ts`) instead of the currently-hardcoded
  `mcp-vertex_proposals_proposal_board` name. Keep the existing spec green.
- **Files**: `extensions/vscode/src/views/proposals-board-view.ts` (new),
  `extensions/vscode/src/lib/proposals-snapshot.ts` (new, shared with S3 + S5),
  `extensions/vscode/src/views/proposals-board.css` (new)
- **Agent**: implementation_runner
- **Gate**: typecheck
- **Acceptance**:
  - "`IProposalsBoardProvider` implements `vscode.TreeDataProvider` and
    exposes status-group roots (`Ready`, `In progress`, `Paused`,
    `Review`, `Done`, `Blocked`, `Retired`) plus non-collapsible header
    chips (`Locks (n)`, `Stale (n)`, `Queue (backpressure yes/no)`,
    `Health (ok|warn|crit)`)."
  - "Leaf nodes project `IProposalSummary` through `outputSchema.safeParse`;
    unknown fields pass through, missing fields surface a `recoverable`
    banner with a **Copy error** action."
  - "Refresh triggers: explicit `mcp-vertex.proposals.refresh`, window
    state change to `active`, and cache TTL expiry (default 30 s).
    Filter changes (status / text / tag) never refetch the snapshot."
  - "Filters persist per-session in `context.globalState` under stable
    keys (`mcp-vertex.proposals.filters.*`)."

### S3 — Detail webview

- **Status**: done
- **Done note (2026-07-03)**: shipped as
  `views/proposal-detail-webview.ts` (pure `renderProposalDetailHtml`, no
  `vscode` import, no scripts) rendering the four cards — Header, Slices
  (table), Diagnose (key/value list), Logs (table). It EVOLVES the existing
  `commands/open-proposal.ts` (the valid-id branch now renders this detail
  instead of a raw JSON dump; the absent-id/command-palette branch keeps the
  script-free board JSON). The per-proposal model is built by a new
  `ProposalsSnapshotSource.fetchProposalDetail(id)`: board summary (from the
  shared TTL cache) + `proposal_diagnose {id}` + `logs_tail` narrowed
  client-side to `taskId === id || kind === 'proposal_transition'` (the tail
  tool filters only by kind/outcome). Reuses `escapeHtml` from
  `render-output-schema.ts`. **CSP:** uses the shared `injectCspMeta` +
  `DEFAULT_DENY` (`default-src 'none'; script-src 'none'; style-src 'self'
  'unsafe-inline'`) — stricter than the proposal's aspirational `default-src
  'self'` and consistent with every other webview. Styles are inlined
  (self-contained, like the agent-catalog webview) so no `proposals-detail.css`
  / `asWebviewUri` plumbing is needed — deliberate deviation from the Files
  list. **Not-found** now honours `diagnose.ok === false` so done/retired
  proposals (off the actionable board but still diagnosable) render, while a
  genuinely-unknown id still shows the error toast. Extension wires ONE shared
  `ProposalsSnapshotSource` into both the board provider and the open-proposal
  command (cache sharing). Slice-click "open the markdown file" is deferred (it
  needs `enableScripts` + command URIs; the card is observational per the
  read-only contract). Specs: new `test/proposal-detail-webview.spec.ts` +
  updated `open-proposal-argument.spec.ts` (per-tool stubs). 135 vscode specs
  green; `tsc -p extensions/vscode` exit 0.
- **Files**: `extensions/vscode/src/views/proposal-detail-webview.ts` (new),
  `extensions/vscode/src/views/proposals-detail.css` (new),
  `extensions/vscode/src/lib/proposals-snapshot.ts` (shared with S2)
- **Agent**: implementation_runner
- **Gate**: typecheck
- **Acceptance**:
  - "Opens on click from the board; `proposalId` is passed via
    `extensionUri.query`."
  - "Renders four cards: **Header** (id, title, kind, track, status badge,
    owner, related ids), **Slices** (table: `sliceId`, `title`, `status`,
    `owner`, `gate`, `acceptance`; click → open file at slice heading),
    **Diagnose** (`proposal_diagnose` output as key/value list),
    **Logs** (`logs_tail` filtered by `taskId === proposalId` or by
    `kind: 'proposal_transition'`; tool-side redacted, UI does not
    re-redact)."
  - "Reuses `render-output-schema.ts` and `escapeHtml` from
    `agent-catalog-webview.ts`; no new helpers unless S2 + S3 share one
    (then promote to `extensions/vscode/src/lib/`)."
  - "CSP: `default-src 'self';` (matches the catalog webview)."

### S4 — Command wiring

- **Status**: done
- **Done note (2026-07-03)**: new `commands/proposals-commands.ts` registers
  the two commands the board owns — `mcp-vertex.proposals.refresh` (invalidates
  the shared snapshot + repaints; also on the Proposals view title bar via a
  `view/title` `$(refresh)` button) and `mcp-vertex.proposals.copyError`
  (writes the banner's raw payload to `vscode.env.clipboard`; hidden from the
  command palette with `when: false` since it needs an argument). The global
  `mcp-vertex.refresh` now also calls `proposalsTree.refresh()`. `package.json`:
  the `mcp-vertex.proposals` view gains `icon: media/logo.svg`, plus the two
  command contributions + menus. Deps threaded: `ICommandDeps.proposalsTree`
  (`Pick<…,'refresh'>`) and `ICommandVscodeApi.env.clipboard` (optional, real
  `vscode` provides it; test seams stub it). **Deviations:** (1) the acceptance
  line "`openProposal` opens the proposal board view, focused" predates S3 —
  `openProposal(id)` now opens the read-only DETAIL webview (S3), while the
  sidebar board is always registered + refreshed; a no-arg `openProposal`
  still renders the board JSON. (2) Window-focus auto-refresh
  (`onDidChangeWindowState`) is deferred: the 30 s TTL already bounds staleness
  and explicit refresh (button/command/global) exists, so wiring a new event
  onto the injected host surface was not worth the coupling. Specs: new
  `test/proposals-commands.spec.ts`; `smoke.spec.ts` subscription count 19 → 21.
  139 vscode specs green; `tsc -p extensions/vscode` exit 0; `package.json`
  parses.
- **Files**: `extensions/vscode/package.json`,
  `extensions/vscode/src/extension.ts` (refresh handler)
- **Agent**: implementation_runner
- **Gate**: typecheck
- **Acceptance**:
  - "`mcp-vertex.openProposal` opens the proposal board view, focused,
    with the existing selection."
  - "`mcp-vertex.refresh` now also refreshes the proposals board snapshot
    (calls into `proposals-snapshot.ts` invalidate)."
  - "New command `mcp-vertex.proposals.refresh` is registered, bound to
    the board's local refresh action; same handler as `mcp-vertex.refresh`
    but scoped to the proposals cache key."
  - "`package.json` `contributes.views['mcp-vertex.proposals'].icon`
    matches the activitybar container (`media/logo.svg`)."

### S5 — Web parity

- **Status**: done
- **Done note (2026-07-03)**: **premise reconciled** — `apps/web` is a
  STATIC site (`getStaticPaths`, build-time), so "reads via the SSR data
  layer / calls the read-only tools" is not achievable; there is no live MCP
  server at build. Shipped instead as a static **parity/showcase** page that
  documents the same read-only projection the VS Code host renders live,
  reusing the pre-existing `components/proposals/StatusBadge.astro` +
  `KindBadge.astro` and the 12-lang proposal glossary. Files:
  `pages/[lang]/proposals.astro` + `pages/proposals.astro` (dedicated pages
  mirroring `skills.astro`, NOT `[lang]/proposals/index.astro` — matches the
  sibling convention), `components/ProposalsSection.astro`,
  `i18n/proposals-board.ts`, `styles/components/_proposals-board.scss` (+
  `@use` in `styles.scss`). **i18n:** used the repo's real convention — a
  standalone `proposalBoardByLang` map (en source of truth, es translated,
  other 10 langs → en fallback), exactly like `proposalGlossaryByLang`. This
  is OUTSIDE the site `ITranslations`/`dictsByLang`, so the 12-lang
  `check:i18n` gate is unaffected (the proposal's "9 keys × 12 languages =
  108 strings in ui.ts" was wrong for this repo). Covers all 9 acceptance
  keys (title, filter.status/text/tag, recoverable, detail.diagnose/slices/
  logs/related) plus chips + read-only-contract copy. **Gates:**
  `check:i18n --strict` ✓, `stylelint` (scoped-BEM) ✓, `scan-jsx-literals` ✓,
  and `astro check` reports 0 diagnostics on the 4 new files. **Known
  pre-existing red gate:** `astro check` overall has 2 errors in
  `scripts/gen-capabilities.ts` (`agentCatalogTools` missing from
  `IAssembledCliConfig`) — a STALE gitignored core `dist/public/index.d.ts`
  (predates catalog commit `2353e5a0`), confirmed present on clean develop via
  `git stash`; orthogonal to S5, fixed by a full core type rebuild (see the
  `stale-core-dts-breaks-web-astro-check` memory).
- **Files**: `apps/web/src/pages/[lang]/proposals/index.astro` (new),
  `apps/web/src/data/pages/proposals/index.md` (new),
  `apps/web/src/i18n/ui.ts` (9 new keys × 12 languages),
  `apps/web/src/styles/_view-transitions.scss` (extend if needed)
- **Agent**: implementation_runner
- **Gate**: validate
- **Acceptance**:
  - "`apps/web/src/pages/[lang]/proposals/index.astro` reads via the
    same read-only tool whitelist as S1 and projects through the same
    TypeScript types as S2."
  - "Cards match S3 (CSS via existing `_view-transitions.scss` patterns
    from f00069)."
  - "Page is served by `[page].astro` after registration in
    `apps/web/src/data/pages/proposals/*.md`."
  - "i18n keys added to every language in `apps/web/src/i18n/ui.ts`:
    `proposals.board.title`, `proposals.board.filter.status`,
    `proposals.board.filter.text`, `proposals.board.filter.tag`,
    `proposals.board.recoverable`, `proposals.detail.diagnose`,
    `proposals.detail.slices`, `proposals.detail.logs`,
    `proposals.detail.related`."
  - "`bun run check:i18n` remains green."

### S6 — E2E + acceptance

- **Status**: done
- **Done note (2026-07-03)**: shipped as a **lightweight** e2e (user-approved
  over the heavy `@vscode/test-electron` harness, which would download VS Code
  + run Electron and largely duplicates the S2–S4 unit coverage). New
  `extensions/vscode/src/test/proposals-board.spec.ts` wires the real
  provider + open-proposal + copy-error commands through ONE canned stub
  client (board + compact_status + state_health + stale_list + diagnose +
  logs_tail) and asserts the four S6 behaviors as a flow: (a) every status
  group renders exactly once when the snapshot has one per family, (b) a leaf's
  command dispatches `openProposal` with the correct id and opens the detail
  webview for that id, (c) refresh refetches but a filter change does not, (d)
  a malformed board yields a recoverable banner (no crash) and Copy-error
  places VALID JSON on the clipboard. New `apps/web/tests/ui/proposals-page.spec.ts`
  pins the web-parity acceptance: `proposalBoardByLang` + `proposalGlossaryByLang`
  resolve for all 12 languages, every key the page reads is present, and the
  non-en/es fallback maps to the `en` object. 143 vscode specs green; web spec
  green. **Deferred:** the full `@vscode/test-electron` harness is noted as a
  separate infra task (the unit + integration coverage stands in for it).
- **Files**: `extensions/vscode/src/test/proposals-board.spec.ts` (new),
  `apps/web/tests/proposals-page.spec.ts` (new),
  the 4 implementation files above + this proposal
- **Agent**: delivery_verifier
- **Gate**: validate
- **Acceptance**:
  - "`extensions/vscode/src/test/proposals-board.spec.ts` stubs the stdio
    client with canned `proposal_board`, `compact_status`, `state_health`,
    and `logs_tail` payloads; asserts: (1) the board renders every status
    group exactly once when the snapshot has one per family, (2) clicking
    a row dispatches `openProposal` with the correct `proposalId`,
    (3) refresh-on-focus produces a fresh snapshot but does NOT refetch
    on filter changes (debounce check), (4) `outputSchema` violations
    surface as a `recoverable` banner, not a crash, and the **Copy
    error** action places valid JSON in the clipboard."
  - "`apps/web/tests/proposals-page.spec.ts` server-side renders with the
    same canned stub; asserts the page parses without runtime errors and
    the i18n keys resolve in all 12 languages."
  - "`bun run validate` is green end-to-end."

## acceptance

- `bun run typecheck` → exit 0.
- `bun run test` → exit 0.
- `bun run validate` → exit 0.
- `bun run lint` remains clean without errors.

## risks

- **Latency on first paint.** First refresh loads three tools
  (board + compact_status + state_health). Mitigation: parallel
  calls via `Promise.all` in the snapshot module; the cache key is
  populated only after all three resolve.
- **Schema drift.** The proposals plugin's tool outputs evolve. The
  UI consumes via `safeParse` and tolerates unknown fields. Any
  breaking change to `outputSchema` is a separate, explicit proposal.
- **i18n blow-up.** Nine new keys × 12 languages = 108 strings.
  Mitigation: `bun run check:i18n` is the gate; without all 108
  strings the proposal does not ship (existing repo invariant).
- **Web parity eats cycles.** f00069 S3 is still pending; if S5
  ships before f00069 S3 lands, the proposals page falls back to the
  non-cross-fade `<Tabs>` variant. Acceptable; documented.
- **Read-only drift.** A future contributor might add a mutation
  button "because it is easy". Mitigation: the verification step S6
  explicitly greps the implementation for the mutation tool names
  and fails if any are present.

## notes

### Deliverables

- `extensions/vscode/src/views/proposals-board-view.ts`
  (~280 lines, plus a small `IProposalsBoardProvider.test.ts`).
- `extensions/vscode/src/views/proposal-detail-webview.ts`
  (~320 lines).
- `extensions/vscode/src/views/proposals-board.css` +
  `proposals-detail.css` (extends the catalog webview tokens, no
  new color variables).
- `extensions/vscode/src/lib/proposals-snapshot.ts`
  (cache + refresh logic, ~80 lines; promoted out of S2 because
  S3 and S5 share it).
- `apps/web/src/pages/[lang]/proposals/index.astro`
  (~120 lines).
- `apps/web/src/data/pages/proposals/index.md` (page spec).
- i18n keys added to `apps/web/src/i18n/ui.ts` in all 12 languages.
- Design note appended to `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md`
  (read-only tool whitelist rationale).
- Tests: `extensions/vscode/src/test/proposals-board.spec.ts`,
  `apps/web/tests/proposals-page.spec.ts`.
- No new mutation surface. No new persisted state in the proposals
  plugin. No changes to `packages/core`.
- The read-only tool whitelist is the **contract** between this
  proposal and the proposals plugin. Adding a tool to the whitelist
  requires an explicit decision in a follow-up proposal — S1's
  design note is the canonical reference.
- After S1 closes, the proposals plugin emits no new tools. Status
  snapshot: the whitelist is documented in
  `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` and mirrored as a
  TypeScript `const READ_ONLY_TOOLS` in
  `extensions/vscode/src/views/proposals-board-view.ts`; `bun run
  validate` is green.
- The detail webview surfaces the latest `status_marker_close` line
  for the slice owner when available via `logs_tail`, so a reviewer
  can audit "did the last agent close with the right state?" without
  leaving VS Code. This is observational only — no parser, no
  validation, no enforcement; the host appendix §8.1 contract
  remains the agent's responsibility.