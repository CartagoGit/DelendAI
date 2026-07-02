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

# f00096 — VS Code proposals board + detail webview (read-only observability)

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
   status of f00096?" is the terminal.
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

### S1 — Read-only tool whitelist (proposal_guardian)

Decide which proposals-plugin tools the host may call. The whitelist
is the *contract* between this proposal and the proposals plugin:
adding a tool to the whitelist requires an explicit decision here.

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

Deliverable: a short design note appended to
`docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` documenting the whitelist and
the rationale per tool.

### S2 — Sidebar board view (implementation_runner)

- `extensions/vscode/src/views/proposals-board-view.ts`:
  - `IProposalsBoardProvider` implementing `vscode.TreeDataProvider`.
  - Root nodes: status groups (`Ready`, `In progress`, `Paused`,
    `Review`, `Done`, `Blocked`, `Retired`). Group order matches the
    proposals folder cascade.
  - Leaf nodes: `IProposalSummary` projection, fields: `id`, `title`,
    `kind`, `track`, `tags`, `lastTransition`, `owner`.
  - Top-level "header" nodes (non-collapsible): `Locks (n)`,
    `Stale (n)`, `Queue (backpressure yes/no)`, `Health (ok|warn|crit)`.
    Pulled from `compact_status` and `state_health`.
- Cache key: `mcp-vertex.proposals.snapshot`.
- Refresh triggers: explicit command (`mcp-vertex.proposals.refresh`),
  window state change to `active`, cache TTL expiry.
- Filters (sticky per-session, persisted in `globalState`):
  - Status (multi-select, default: all).
  - Text (substring on id + title, debounced 200 ms).
  - Tag (multi-select; tags derived from a single snapshot, not a
    separate tool call).
- Validation: `outputSchema.safeParse` on every tool result; failures
  produce a `recoverable` banner (not a crash) with a **Copy error**
  action that puts the violation JSON in the clipboard.

### S3 — Detail webview (implementation_runner)

- `extensions/vscode/src/views/proposal-detail-webview.ts`:
  - Opens on click from the board; `proposalId` is passed via
    `extensionUri.query`.
  - Renders four cards:
    1. **Header** — id, title, kind, track, status badge, owner,
       related (clickable ids).
    2. **Slices** — table: `sliceId`, `title`, `status`, `owner`,
       `gate`, `acceptance`. Click a slice → opens the proposal file
       in the editor at the slice heading.
    3. **Diagnose** — output of `proposal_diagnose` rendered as a
       key/value list with severity colors.
    4. **Logs** — `logs_tail` filtered by `taskId === proposalId`
       (or by `kind: 'proposal_transition'` when `taskId` is absent);
       redacted (the tool already redacts, the UI does not
       re-redact).
- Reuses `render-output-schema.ts` and `escapeHtml` from
  `agent-catalog-webview.ts`; no new helpers unless S2 + S3 share one
  (then promote to `extensions/vscode/src/lib/`).
- CSP: same as the catalog webview (`default-src 'self';`).

### S4 — Command wiring (implementation_runner)

- `mcp-vertex.openProposal` (already declared): now opens the
  proposal board view, focused, with the existing selection.
- `mcp-vertex.refresh` (already declared): now also refreshes the
  proposals board snapshot.
- New: `mcp-vertex.proposals.refresh` — bound to the board's local
  refresh action; same handler as `mcp-vertex.refresh` but scoped to
  the proposals cache key.
- `package.json`: update the `mcp-vertex.proposals` view icon to
  match the activitybar container (`media/logo.svg` — already
  shipped; just explicit per view).

### S5 — Web parity (implementation_runner)

- `apps/web/src/pages/[lang]/proposals/index.astro`:
  - Server-side reads via the same read-only tool whitelist as S1.
  - Projection identical to S2; cards identical to S3 (CSS via the
    existing `_view-transitions.scss` patterns from f00069).
  - Page registration in `apps/web/src/data/pages/proposals/*.md`
    so `[page].astro` serves it.
- i18n keys added to **every** language in
  `apps/web/src/i18n/ui.ts`:
  - `proposals.board.title`, `proposals.board.filter.status`,
    `proposals.board.filter.text`, `proposals.board.filter.tag`,
    `proposals.board.recoverable`, `proposals.detail.diagnose`,
    `proposals.detail.slices`, `proposals.detail.logs`,
    `proposals.detail.related`.
- `bun run check:i18n` must remain green; the i18n thread
  complements f00059.

### S6 — E2E + acceptance (delivery_verifier)

- `extensions/vscode/src/test/proposals-board.spec.ts`:
  - Stub stdio client returns canned `proposal_board`,
    `compact_status`, `state_health`, and `logs_tail` payloads.
  - Asserts:
    1. Board renders every status group exactly once when the
       snapshot has one proposal per status.
    2. Clicking a row dispatches `openProposal` with the correct
       `proposalId`.
    3. Refresh-on-focus produces a fresh snapshot but **does not**
       refetch when only the search filter changes (debounce check).
    4. `outputSchema` violations surface as a `recoverable` banner,
       not a crash, and the **Copy error** action places valid JSON
       in the clipboard.
- `apps/web/tests/proposals-page.spec.ts`:
  - Server-side render with the same canned stub; asserts the page
    parses without runtime errors and the i18n keys resolve in all
    12 languages.
- `bun run validate` is green end-to-end.

## deliverables

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

## status snapshot at end of slice S1

- The read-only tool whitelist is documented in
  `docs/mcp-vertex/PLUGINS-MCP-VERTEX.md` and mirrored as a
  TypeScript `const` in `extensions/vscode/src/views/proposals-board-view.ts`.
- The proposals plugin emits no new tools.
- `bun run validate` is green.