---
id: f00058
status: ready
type: proposal
track: security+webview+extension-ux
date: 2026-06-25
kind: feat
title: Webview hardening — CSP, action allow-list, settings persistence, proposals TreeData
shipped-in: []
recan: []
related:
    - a00040 # audit that surfaced these findings (H2/H3/H4/H5/H6)
    - f00056 # agent discovery catalog (shares the dashboard webview surface)
    - f00053 # unified web/extension UX (parent proposal)
ownership:
    - { agent: proposal_guardian,    task: 'S1: add `IWebviewCspPolicy` + CSP default-deny + `enableScripts: false` baseline in `packages/ui-extension/src/webview/csp.ts`; per-webview override map; wire all 7 webviews (H2)' }
    - { agent: implementation_runner, task: 'S2: `OPEN_TOOLBAR_COMMAND` allow-list of derived command ids (action whitelist); reject unknown actions with an `unknownAction` result code (H3)' }
    - { agent: implementation_runner, task: 'S3: `openSettings` persists to `globalState` (or workspaceState for project-scoped) instead of in-memory; restore on activation; document in settings UI (H4)' }
    - { agent: implementation_runner, task: 'S4: implement `McpVertexProposalsView` `TreeDataProvider` and register it on activation; tree nodes mirror `mcp-vertex.proposals_status` shape (H5)' }
    - { agent: implementation_runner, task: 'S5: `OPEN_PROPOSAL_COMMAND` reads its `{ proposalId }` argument, validates format (`^\d{5}$`), and routes to the proposals TreeDataProvider node (H6)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,         expect: exit0 }
    - { command: bun run test,              expect: exit0 }
    - { command: bun run lint:tools,        expect: exit0 }
    - { command: bun run lint:audit-ids,    expect: exit0 }
    - { command: bun run lint:proposals,    expect: exit0 }
    - { command: bun run validate,          expect: exit0 }
---

# f00058 — Webview hardening (CSP, allow-list, persistence, TreeData)

## goal

Close audit `a00040` findings **H2, H3, H4, H5, H6** by hardening the 7 webviews shipped from
[`packages/ui-extension/src/webviews/`](packages/ui-extension/src/webviews/ ) and their VS Code
command surfaces in [`extensions/vscode/src/commands/`](extensions/vscode/src/commands/ ).

The 5 slices are dependency-ordered: each slice is independently shippable, gated by
`bun run validate`, and constrained to one webview/command surface so a parallel agent can
claim a single slice without blocking the rest.

## why

`a00040` (independent exhaustive audit, 2026-06-25) read the activation surface of
[`extensions/vscode/src/extension.ts`](extensions/vscode/src/extension.ts ) and found that:

- **H2** — 7 webviews are created with `enableScripts: true` and no `Content-Security-Policy`
  in their HTML options. The `index.html` sources inline `<script>` blocks plus their
  `iframe` for docs, so a malicious page (or a compromised `<script src=>`) has the full
  extension-host WebView API surface.
- **H3** — [`OPEN_TOOLBAR_COMMAND`](extensions/vscode/src/commands/open-toolbar.command.ts )
  dispatches any `action` it finds in the toolbar payload. A crafted message from the
  webview (XSS or just confused-deputy) can run arbitrary `vscode.commands.executeCommand(...)`
  with arbitrary arguments.
- **H4** — [`openSettings`](extensions/vscode/src/commands/open-settings.command.ts ) stores
  the user's settings in module-scope variables. Reloading the window drops them.
- **H5** — `proposals` is declared in `contributes.views` (and the package.json
  `activationEvents`) but there is no `TreeDataProvider`. The view is empty.
- **H6** — [`OPEN_PROPOSAL_COMMAND`](extensions/vscode/src/commands/open-proposal.command.ts )
  accepts a `proposalId` argument and ignores it — the opened view shows the global status
  board instead of the requested proposal.

The 5 findings cluster naturally: they all touch the **webview ↔ extension command surface**
which is the most attacked boundary of an extension.

## why this design

**CSP default-deny with per-webview overrides** keeps the security boundary in one place
(`IWebviewCspPolicy`) instead of N copies. The allow-list for `OPEN_TOOLBAR_COMMAND` is a
plain `Set<string>` exported from one module so security review is a `grep`. Persisting
settings in `globalState` is the documented VS Code path and survives reload by design.

**`McpVertexProposalsView` as a real `TreeDataProvider`** mirrors the proposals plugin's
status output (`mcp-vertex.proposals_status`) — one source of truth, no shape drift. The
`OPEN_PROPOSAL_COMMAND` argument is validated against `^\d{5}$` (the same regex the
proposals linter enforces for proposal ids).

## non-goals

- **CSP for the docs iframe specifically** — that's H11 from a00040, deferred to a
  separate proposal because the fix is `sandbox="allow-scripts"` only (no CSP change).
- **Replacing the proposals status tree** with a custom webview. The TreeDataProvider
  is the documented VS Code UX; we adopt it.

## architecture

```
packages/ui-extension/src/webview/
  csp.ts                      # NEW: IWebviewCspPolicy + DEFAULT_DENY + per-webview overrides
  webview-options.ts          # NEW: composes { enableScripts, localResourceRoots, port } + csp
  webviews/
    dashboard/index.html      # inject CSP via <meta http-equiv>
    settings/index.html       # same
    ...
extensions/vscode/src/
  commands/
    open-toolbar.command.ts   # ADD: ALLOWED_ACTIONS allow-list Set<string>; reject else
    open-settings.command.ts  # REPLACE: in-memory → context.globalState
    open-proposal.command.ts  # ADD: validate proposalId, pass to view.reveal()
  views/
    proposals-tree.ts         # NEW: McpVertexProposalsView extends TreeDataProvider<ProposalNode>
  extension.ts                # wire new view + new csp usage
```

## slices

### S1 — CSP default-deny + 7 webviews opt-in (closes H2)

**File:** [`packages/ui-extension/src/webview/csp.ts`](packages/ui-extension/src/webview/csp.ts ) (NEW)

```typescript
export interface IWebviewCspPolicy {
  readonly scriptSrc: readonly string[];
  readonly styleSrc: readonly string[];
  readonly connectSrc: readonly string[];
  readonly frameSrc: readonly string[];
}

export const DEFAULT_DENY: IWebviewCspPolicy = Object.freeze({
  scriptSrc: ["'none'"],
  styleSrc: ["'self' 'unsafe-inline'"],  // Astro inline styles
  connectSrc: ["'none'"],
  frameSrc: ["'none'"],
});

export const WEBVIEW_CSP_OVERRIDES: ReadonlyMap<string, Partial<IWebviewCspPolicy>> = new Map([
  // The dashboard loads a <script src="..."> from local resources; allow 'self'
  ['dashboard', { scriptSrc: ["'self'"], connectSrc: ["'self'"] }],
  // Settings does not need scripts at all
  ['settings', {}],
  // (6 more — one per webview)
]);
```

Then change [`createWebviewPanel`](extensions/vscode/src/webview/create-webview-panel.ts ) to
inject the per-webview CSP via a `<meta http-equiv>` tag in the HTML it returns, and
**set `enableScripts: false` by default** (override opt-in via the per-webview map).

**Tests:**
- `csp.spec.ts` — default-deny shape; override merge; immutable (`Object.freeze`).
- `webview-options.spec.ts` — for each of the 7 webviews, `enableScripts === false` unless
  the override says otherwise; CSP header is present in the HTML payload.

### S2 — `OPEN_TOOLBAR_COMMAND` action allow-list (closes H3)

**File:** [`extensions/vscode/src/commands/open-toolbar.command.ts`](extensions/vscode/src/commands/open-toolbar.command.ts )

```typescript
const ALLOWED_ACTIONS: ReadonlySet<string> = new Set([
  'open-settings',
  'open-proposal',
  'run-quality',
  'open-knowledge',
  // …
]);

export function executeOpenToolbar(action: string, payload: unknown): ICommandResult {
  if (!ALLOWED_ACTIONS.has(action)) {
    return { ok: false, code: 'unknownAction', action };
  }
  // …existing dispatch
}
```

**Tests:** every existing `case` in the dispatch gets a `toBe(true)` membership check. A
new test sends a crafted `{ action: 'workbench.action.openSettings' }` and expects
`unknownAction`.

### S3 — `openSettings` persists to `globalState` (closes H4)

**File:** [`extensions/vscode/src/commands/open-settings.command.ts`](extensions/vscode/src/commands/open-settings.command.ts )

Replace the in-memory `Map<string, unknown>` with `context.globalState` reads/writes.
On `activate()` after construction, hydrate the in-memory cache from `globalState` so the
first read is synchronous (the existing callers expect sync).

**Tests:** write a setting via the command, simulate a window reload (re-create the
extension context), read it back — it must equal what was written.

### S4 — `McpVertexProposalsView` `TreeDataProvider` (closes H5)

**File:** [`extensions/vscode/src/views/proposals-tree.ts`](extensions/vscode/src/views/proposals-tree.ts ) (NEW)

```typescript
export class McpVertexProposalsView implements vscode.TreeDataProvider<ProposalNode> {
  private readonly emitter = new vscode.EventEmitter<ProposalNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  async getChildren(element?: ProposalNode): Promise<ProposalNode[]> {
    // mirror the proposals plugin's compact_status output
    return await this.bridge.compactStatus();
  }

  getTreeItem(node: ProposalNode): vscode.TreeItem {
    return new vscode.TreeItem(node.label, node.collapsibleState);
  }
}
```

Register in `extension.ts`:
```typescript
const tree = new McpVertexProposalsView(bridge);
vscode.window.registerTreeDataProvider('mcp-vertex.proposals', tree);
context.subscriptions.push(tree);
```

**Tests:** stub the bridge with two known proposals; assert the tree returns them with
correct labels and collapsible states.

### S5 — `OPEN_PROPOSAL_COMMAND` honors its argument (closes H6)

**File:** [`extensions/vscode/src/commands/open-proposal.command.ts`](extensions/vscode/src/commands/open-proposal.command.ts )

```typescript
const PROPOSAL_ID_REGEX = /^\d{5}$/;

export function executeOpenProposal(
  proposalId: string | undefined,
  view: McpVertexProposalsView,
): ICommandResult {
  if (!proposalId) {
    return { ok: false, code: 'missingProposalId' };
  }
  if (!PROPOSAL_ID_REGEX.test(proposalId)) {
    return { ok: false, code: 'malformedProposalId', proposalId };
  }
  view.reveal(proposalId);
  return { ok: true };
}
```

**Tests:** every input shape is exercised — `undefined`, malformed (`'abc'`, `'12345a'`),
valid (`'f00058'`, `'a00040'`). Only the valid case calls `reveal(...)`.

## dependency graph

```
S1 (CSP) ────────────────────────────────┐
                                          │
S2 (allow-list) ─── independent ──────────┤
S3 (globalState) ── independent ───────────┤
S4 (TreeData)    ──┬── S5 (reveal) ────────┤
                    │                       │
S5 depends on S4 ───┘                       │
                                          ▼
                                    all slices pass `bun run validate`
```

S1 can land first because it's purely additive (adds `csp.ts`, modifies the webview
options builder). S2 + S3 are independent. S5 depends on S4.

## acceptance

`bun run validate` exits 0 with the 5 slices merged. The `IWebviewCspPolicy` policy has a
frozen spec test. The action allow-list has a unit test that proves an unknown action
returns `unknownAction`. `globalState` settings survive a context reconstruction.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| Breaking inline `<script>` in 1 of the 7 webviews when we set CSP | The per-webview override map (S1) carries the opt-in for `script-src 'self'`. We test each webview individually. |
| `globalState` quota exceeded (5 MB default) | We only persist primitive JSON; document the limit in the settings UI; reject with a typed error if the write would exceed the quota. |
| TreeDataProvider blocks the UI thread | `getChildren()` is already async (mirrors `compactStatus` which awaits); we register no `reveal` until children load. |

## notes

The proposals linter already enforces `^\d{5}$` for proposal ids, so S5's validation is
consistent with the rest of the repo. CSP `default-deny` is a deliberate hard-line — if a
future webview needs `'unsafe-inline'` scripts, the security review has to approve the
override, which is the desired friction.