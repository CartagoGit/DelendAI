---
id: f113
kind: feat
title: Proposal state machine, kinds, scaffolds, and recovery
status: ready
triaged: true
date: 2026-06-20
track: proposals+core+web+notification
budget: { maxInputTokens: 80000, maxOutputTokens: 40000, maxIterations: 100 } # per slice-claim, see §4.10
ownership:
  - { agent: implementation_runner, task: "S1-S5, S11-S13: state machine + kinds + linters + reconciler + migration + id allocator" }
  - { agent: implementation_runner, task: "S8-S9: agent-alive/idle/dead events over the heartbeat mtime + recovery tools" }
  - { agent: implementation_runner, task: "S6, S10: i18n glossary + status badges + recovery dashboard + SSE" }
reservedFiles:
  - docs/scaffolds/
  - docs/proposals/
  - plugins/proposals/src/lib/proposals/sync-proposal-registry.ts
  - plugins/proposals/src/lib/proposals/proposal-document.ts
  - plugins/proposals/src/lib/proposals/adopt.ts
  - plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts
  - plugins/proposals/src/lib/tools/continue-proposal.tool.ts
  - plugins/proposals/src/lib/tools/proposal-transition.tool.ts
  - plugins/proposals/src/lib/tools/recovery-tools.ts
  - plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts
  - plugins/proposals/src/lib/proposals/proposal-id-allocator.ts
  - .cache/mcp-vertex/proposal-id-counters.json
  - plugins/notification/src/lib/agent-events.ts
  - plugins/notification/src/lib/agent-events-bridge.ts
  - plugins/notification/src/lib/tools.ts
  - apps/web/src/i18n/langs/
  - apps/web/src/i18n/check-i18n.ts
  - apps/web/src/pages/status/recovery.astro
  - apps/web/src/components/recovery/
  - apps/web/src/pages/api/events/
  - scripts/lint-scaffolds.ts
  - scripts/migrate-legacy-proposals.ts
  - scripts/normalize-legacy-proposals.ts
  - scripts/rewrite-proposal-refs.ts
acceptance:
  - { command: bun run type, expect: exit0 }
  - { command: bun run test, expect: exit0 }
  - { command: bun run site:strict, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
  - { command: bun run lint:scaffolds, expect: exit0 }
related:
  - p111 # post-closure audit (the closed reference for prefix conventions)
  - p112 # parallel proposal; lives in paused/ after this lands
  - p99 # the audit plugin whose lifecycle this proposal formalises
---

# f113 — Proposal state machine, kinds, scaffolds, and recovery

## 0. Goal

Replace the proposal status union with a clean state machine, link each
proposal to a kind via filename prefix, enforce a canonical scaffold via
linter, and replace polling-based stale detection with a notification
channel that lets any subscriber (agents, orchestrator, dashboard) react
to agent lifecycle events within `3 × heartbeatMs`.

## 1. Why

Today the proposal workflow has four problems:

1. **8 overlapping statuses** (`pending`, `in_progress`, `ready`, `blocked`,
   `done`, `retired`, `paused`, `deferred`) with no clear distinction between
   "blocked by something else" and "paused by a human". The `auto_work`
   cascade skips them inconsistently because the signals are duplicated.
2. **One kind for everything** (`type: proposal` on all 14 `.md`). There is
   no link between a proposal's intent (feat vs fix vs refactor) and the
   Conventional Commit it produces, so `release.ts` cannot derive the
   semver bump from the proposal alone.
3. **No canonical scaffold**. Each proposal invents its own headings;
   agents have to re-discover where the Goal lives, where the Slices live,
   and what "done" means. The `proposal-document.ts` parser extracts
   `goal`, `motivation`, `goals`, `nonGoals`, `closureCriteria` but the
   order and presence are not enforced, so two proposals in the same
   folder can look completely different.
4. **Stale agents are detected by polling, not by event**. The
   `withFileMutex` heartbeat already exists but no one listens for it as
   a lifecycle signal. A crashed agent leaves a proposal stuck in
   `in-progress/` until a human notices (or until the agent-lock GC
   eventually runs and silently evicts the lock with no notification).

This proposal fixes all four by introducing:

- **7 statuses** (one folder each), with `blocked` and `paused` strictly
  separated and `draft` folded into `blocked-by: [self:*]`.
- **12 kinds** (one single-letter prefix each), with `pNNN` legacy
  preserved as `lNNN` after migration.
- **A `docs/scaffolds/` folder** with one `ARCHITECTURE-*.md` per file
  domain. Linters (`proposal-scaffold-linter`, `lint-scaffolds`) enforce
  them on every `bun run validate`.
- **A subscribe-based recovery system** that piggybacks on the existing
  `withFileMutex` heartbeat mtime, emitting `agent-alive`, `agent-idle`,
  and `agent-dead` notifications so agents and the orchestrator react in
  real time instead of polling.

## 2. Why this design

### 2.1 Why 7 statuses, not 10

The 8-status union has duplicate signals:

| Today | What it really means |
|---|---|
| `pending` | "I want to do this but haven't triaged it" |
| `draft` | "I want to do this but the file is incomplete" |
| → both | "wait for a human or for the file to be filled" |

| Today | What it really means |
|---|---|
| `paused` | "stop, I'll come back" |
| `deferred` | "stop, not this cycle" |
| → both | "human-driven stop with optional horizon" |

Folding `draft` into `blocked-by: [self:goal-missing]` reuses the existing
blocking mechanism (one mechanism, not two). Folding `deferred` into a
`deferred: true` flag on `paused/` reuses the folder.

Result: **5 base statuses + 1 self-block variant + 1 retire terminal = 7
folders**, with 3 flags (`triaged`, `deferred`, `cancelled`) that refine
behaviour without being statuses.

### 2.2 Why 12 kinds with single-letter, single-case prefixes

A proposal's filename prefix tells you its kind without parsing
frontmatter. The mapping is 1:1, and **every prefix is lowercase** — no
two prefixes are distinguished only by case:

| Prefix | Kind | Glyph | Conventional Commit | Bump |
|---|---|---|---|---|
| `f` | feat | ✨ | `feat:` | minor |
| `b` | breaking | 💥 | `feat!:` | major |
| `x` | fix | 🐛 | `fix:` | patch |
| `r` | refactor | 🛠️ | `refactor:` | patch |
| `v` | perf | ⚡ | `perf:` | patch |
| `a` | audit | 🔬 | `chore(audit):` | patch |
| `c` | chore | 🧹 | `chore:` | patch |
| `d` | docs | 📚 | `docs:` | none |
| `t` | test | 🧪 | `test:` | none |
| `i` | infra | 🏗️ | `chore(infra):` | none |
| `s` | spike | 🧭 | — | none |
| `l` | legacy | 📦 | `feat:` | minor |

`p` (lowercase) is **retired**: it was the old, undifferentiated
proposal prefix and is never assigned to a new file again, but the 14
existing `pNNN-…` files keep that literal prefix on disk until S11
migrates them (`git mv` to `lNNN-…`, kind `legacy`) — `p` and `l` both
resolve to `kind: legacy` in `PROPOSAL_KIND_BY_PREFIX` during the
transition, then `p` drops out of the live mapping once S11 completes.

An earlier draft used uppercase `P` (perf) and `L` (legacy) to dodge
the collision with `p`. That fails on any case-insensitive filesystem
(macOS APFS default, Windows NTFS): `P042-x.md` and `p042-x.md` are
**the same file** there, even though Linux/CI (case-sensitive) would
treat them as distinct — a contributor on Mac/Windows could silently
clobber a legacy proposal with a new perf one. Picking `v` (mnemonic:
*velocity*) for perf instead removes the need for any case trick: all
12 live prefixes are single, distinct, lowercase letters, so prefix
uniqueness no longer depends on filesystem case-sensitivity at all.

### 2.3 Why `docs/scaffolds/` instead of one big `SCAFFOLDS.md`

Each file domain has its own invariants. A monolithic document mixes
concerns and is hard to keep in sync. One `ARCHITECTURE-<DOMAIN>.md`
per domain (proposals, audits, ADRs, workflows, tools, docs, memory)
lets the docs plugin serve them as separate web pages and lets each
linter import only the section it needs.

### 2.4 Why subscribe, not poll

The `withFileMutex` heartbeat already touches the mutex file's mtime
every `heartbeatMs`. That mtime is the source of truth for "this agent
is alive". A new watcher (`plugins/notification/src/lib/agent-events.ts`)
observes the mtime and emits:

- `agent-alive` on every mtime bump (informational, lets the dashboard
  draw a green dot).
- `agent-idle` after 10 heartbeat cycles with no mtime change (the
  agent finished or is between tasks).
- `agent-dead` after 3 missed cycles (the agent crashed or hung).

These flow through the existing `notification` plugin's
`notifications/message` channel, so any subscriber (agents, the
recovery dashboard, `auto_work`, the task queue) reacts in real time.
**No polling, no `setInterval` for stale detection**, no `bun run
reconcile` needed to surface zombies.

## 3. Non-goals

- **Not** changing the swarm coordination logic, the task queue engine,
  the agent-lock registry, or the `release.ts` semver mapping.
- **Not** introducing JSON sidecars. Every file stays `.md` with
  frontmatter (Option C from the design discussion).
- **Not** rewriting the prose of the 14 legacy proposals. Slice S12 is
  a `refactor:` of shape, not content.
- **Not** removing the `pNNN-…` filenames. They become `lNNN-…` via
  `git mv`, preserving blame and external references.

## 4. Architecture

### 4.1 The 7 folders

```
docs/proposals/
├── ready/         # triaged, waiting for an agent
├── in-progress/   # agent holds the lock and is working
├── review/        # implementer submitted; reviewer must approve/request_changes
├── done/          # approved and archived (terminal)
├── paused/        # human-paused, will resume
├── blocked/       # blocked-by deps OR blocked-by [self:*] for drafts
└── retired/       # cancelled / superseded (terminal)
```

The folder ↔ status mapping is enforced by the reconciler (S5) and by
the proposal linter (S2).

### 4.2 Status transitions (DFA)

```
   proposal_resume
       ▲            ┌── claim ──┐
       │            ▼           │
   paused ──► ready ─────► in-progress ──submit──► review ──┬─approve──► done
       ▲     ▲    │             │   ▲                     │
       │     │    │             │   └── request_changes ───┘
       │     │    ▼             ▼
       │     │  blocked ◄── proposal_block
       │     │    │
       │     │    ▼ (deps satisfied)
       │     └── ready (auto, when blocked-by resolves)
       │
       └─────────────── (any) ──proposal_retire──► retired (terminal)
```

- `done` and `retired` are terminal. Exit requires explicit
  `proposal_retire` (rare, defensive).
- `paused` requires `proposal_resume` (human) to leave.
- `blocked` auto-resolves to `ready` when `blocked-by` becomes empty
  (deps reach `done`, or self-block issues are fixed).
- `review` → `in-progress` is the `request_changes` loop.

### 4.3 Filename ↔ kind (enforced by S2)

The regex for a valid proposal filename — lowercase only, no case
ambiguity (§2.2):

```typescript
/^[a-z]\d{3,}-[a-z0-9-]+\.md$/u
```

Captured groups: `[letter][digits][-][slug].md`.

The linter checks:

```typescript
const prefix = filename[0];                                  // 'f', 'b', 'x', …
const kind = frontmatter.kind;                               // 'feat', 'breaking', 'fix', …
const expectedPrefix = PROPOSAL_PREFIX_BY_KIND[kind];        // 'f', 'b', 'x', …
if (prefix !== expectedPrefix) {
  throw new LintError(
    `filename starts with '${prefix}' (kind=${PROPOSAL_KIND_BY_PREFIX[prefix]}) ` +
    `but frontmatter.kind = '${kind}' (expected prefix '${expectedPrefix}')`
  );
}
```

### 4.4 Frontmatter schema (Zod)

```typescript
const ProposalFrontmatterSchema = z.object({
  id: z.string().regex(/^[a-z]\d{3,}$/u),
  kind: z.enum([
    'feat', 'breaking', 'fix', 'refactor', 'perf',
    'audit', 'chore', 'docs', 'test', 'infra',
    'spike', 'legacy',
  ]),
  title: z.string().min(8),
  status: z.enum([
    'ready', 'in-progress', 'review', 'done',
    'paused', 'blocked', 'retired',
  ]),
  date: z.string().datetime(),
  track: z.string().min(1),
  // Optional modifiers
  triaged: z.boolean().optional(),
  deferred: z.boolean().optional(),
  cancelled: z.boolean().optional(),
  superseded_by: z.string().optional(),
  blocked_by: z.array(z.string()).optional(),
  // Agent plumbing
  last_heartbeat_at: z.string().datetime().optional(),
  owner_agent: z.string().optional(),
  // Project hooks
  budget: z.object({
    maxInputTokens: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    maxIterations: z.number().optional(),
    maxToolCalls: z.number().optional(),
  }).optional(),
  ownership: z.array(z.object({
    agent: z.string(),
    task: z.string(),
    files: z.array(z.string()).optional(),
  })).optional(),
  reservedFiles: z.array(z.string()).optional(),
  acceptance: z.array(z.object({
    command: z.string(),
    expect: z.string(),
    timeoutMs: z.number().optional(),
  })).optional(),
  // Bookkeeping
  related: z.array(z.string()).optional(),
  shipped_in: z.array(z.string()).optional(),
  closed: z.string().datetime().optional(),
});
```

### 4.5 Canonical body sections (linter-enforced order)

Required core order — always these five, always in this order:

```markdown
## Goal              (required, 1 paragraph)
## Why               (required, 1-3 paragraphs, link to the parent audit if any)
## Non-goals         (required, bullets)
## Slices            (required)
## Acceptance        (required, checkboxes + commands)
```

A leading `<N>. ` on any `##` heading (`## 0. Goal`, `## 1. Why`, …) is
accepted as equivalent to the bare name — the linter strips
`/^\d+\.\s*/` before matching, so numbering is a style choice, not a
distinct heading. This proposal numbers its own headings end-to-end
(`## 0. Goal` … `## 9. Notes`) precisely so the numbers stay meaningful
as cross-reference anchors (`§4.6`, `(S1)`) across a long document —
the linter must accept that, not force every proposal to drop
numbering to pass.

Four **optional** sections may additionally appear, each in a fixed
slot relative to the required five — this is what lets an
architectural proposal like this one carry the detail it needs without
inventing an unenforceable, ad-hoc structure:

```markdown
## Goal
## Why
## Why this design   (optional — between Why and Non-goals; deeper
                       rationale for *this* design over alternatives,
                       as opposed to Why's "why does this problem
                       need solving at all")
## Non-goals
## Architecture      (optional — between Non-goals and Slices)
## Slices
## Dependency graph  (optional — between Slices and Acceptance)
## Acceptance
## Risks and mitigations  (optional — between Acceptance and Notes)
## Notes             (optional, free prose at the end)
```

Each slice (`### S<N> — <title>`) supports **two** equivalent slice
formats — small/simple proposals can use the terse one; large
architectural proposals (like this one) can use the narrative one
without that being a scaffold violation:

```markdown
### S<N> — <title>                              (terse form)
  - **Status**: pending | in-progress | review | done
  - **Files**: [`path`, …]
  - **Command**: `bun run …`
  - **Expect**: exit0 | pass | synchronized | contains:<substring>
  - **Depends-on**: S<N-1>           (optional)
  - **Notes**: free text             (optional)
```

```markdown
### S<N> — <title> *(excl. `path`, `path`, …)*    (narrative form)
  - **Status**: pending | in-progress | review | done
  - free-prose bullets describing the implementation steps
  - **Gate**: `bun run …`           (Command + Expect:exit0 combined)
  - **Estimated work**: <N> session(s)
  - **Depends on**: S<N-1>          (optional)
```

The narrative form's `(excl. …)` parenthetical in the heading **is**
the `Files` field (machine-extractable: everything inside the
parentheses, comma-split); `Gate` **is** `Command` with an implicit
`Expect: exit0`. The linter (S2) recognises either form — it does not
require both `Command` and `Expect` as separate bullets when `Gate`
already encodes both.

The linter (`proposal-scaffold-linter.ts`) extracts the section
headings in order (after stripping leading numbering), errors if any
required section is missing or out of order, errors if an optional
section appears outside its fixed slot, and validates that each slice
resolves to all four logical fields (`Status`, `Files`, `Command`,
`Expect`) under either form.

### 4.6 Subscribe-based recovery

The recovery model is **three layers**, all wired through the existing
notification plugin:

1. **Heartbeat source** (unchanged): `withFileMutex` already touches the
   mutex file's mtime every `heartbeatMs` while an agent holds a claim.
2. **Event emitter** (new, S8): `agent-events.ts` watches the mutex
   file's mtime and emits `agent-alive` / `agent-idle` / `agent-dead`.
3. **Bridge** (new, S8): `agent-events-bridge.ts` re-emits the events
   as `notifications/message` so they flow through the same channel as
   the existing `lock-released`.
4. **Subscribers** (new in S4, S9, S10): the orchestrator and the
   recovery dashboard subscribe; agents can also subscribe to react to
   peer events (e.g. take over a task whose owner went `agent-dead`).

```typescript
// filepath: plugins/notification/src/lib/agent-events.ts (sketch)
export const watchAgentHeartbeat = (
  agent: string,
  taskId: string,
  mutexPath: string,
  emitter: EventEmitter,
  heartbeatMs: number,
): { close: () => void } => {
  let lastSeen = new Date();
  let missedBeats = 0;
  const watcher = watch(mutexPath, () => {
    lastSeen = new Date();
    missedBeats = 0;
    emitter.emit('agent-event', { kind: 'agent-alive', agent, taskId, ts: lastSeen.toISOString() });
  });
  const deadInterval = setInterval(() => {
    const ageMs = Date.now() - lastSeen.getTime();
    if (ageMs < heartbeatMs * 1.5) return;
    missedBeats += 1;
    if (missedBeats === 3) {
      emitter.emit('agent-event', {
        kind: 'agent-dead', agent, taskId,
        lastSeen: lastSeen.toISOString(),
        missedBeats, ts: new Date().toISOString(),
      });
    }
  }, heartbeatMs);
  return { close: () => { watcher.close(); clearInterval(deadInterval); } };
};
```

### 4.7 The 5 recovery tools

| Tool | Purpose | Mutation |
|---|---|---|
| `proposal_force_transition` | Move a proposal to a new status, releasing any lock held by `overrideLockOwner`. Requires non-empty `reason`. | yes |
| `proposal_diagnose` | Return folder + frontmatter + lock + last heartbeat + last agent-dead event + inconsistencies + suggested actions. | no |
| `proposal_reconcile_folder` | Move a proposal file to the folder matching its frontmatter status. Dry-runnable, idempotent. | yes |
| `agent_lock_release_orphan` | Release an orphan lock whose owner has been `agent-dead`. Refuses if owner is alive. | yes |
| `proposal_stale_list` | List proposals whose agent went `agent-dead`. Reads from the event buffer (no scan). | no |

### 4.8 Recovery dashboard

`apps/web/src/pages/status/recovery.astro` is a thin Astro page:

- On render, calls `proposal_stale_list`.
- Renders a table with one row per zombie, one button per suggested
  action (`force-transition`, `release-lock`).
- Subscribes via SSE to `/api/events/agent-dead`; on each event,
  re-fetches the list (no full page reload).

i18n-complete (12 languages) — every UI string is a key in
`apps/web/src/i18n/langs/*.ts#recovery`.

### 4.9 Race-safe per-kind ID allocation

Each kind keeps its **own** sequence — `f113` is independent from `a006` or
`r042`. Today an agent would have to list every file under
`docs/proposals/`, filter by prefix, and compute `max + 1` — racy under
concurrent agents: two agents creating an `f`-kind proposal in the same
instant can both read the same stale directory listing and both compute
`f114`, then one's `git mv`/write clobbers or collides with the other's.

`.cache/mcp-vertex/proposal-id-counters.json` (gitignored machine state,
alongside the existing `agents.lock.json`) holds one integer per kind
prefix:

```json
{ "f": 113, "b": 0, "x": 0, "r": 0, "v": 0, "a": 0, "c": 0, "d": 0, "t": 0, "i": 0, "s": 0, "l": 14 }
```

`allocateNextProposalId(prefix)`
(`plugins/proposals/src/lib/proposals/proposal-id-allocator.ts`):

1. Acquires `withFileMutex` on the counter file — the same primitive every
   other shared-state mutation in this plugin already uses, not a new
   coordination mechanism.
2. Reads it; if missing, **seeds** it by scanning `docs/proposals/**/*.md`
   (all 7 folders) for `^[a-zA-Z]\d{3,}` filenames and taking the max
   per prefix — so the first call after this ships is safe even with the
   14 legacy + `f113` already on disk.
3. Increments the counter for `prefix`, writes atomically, releases.
4. Returns the zero-padded id (`f114`, never `f1`).

`create_proposal` (`authoring.tool.ts`) makes `id` **optional**: if
omitted, it derives `prefix` from `kind` via `PROPOSAL_PREFIX_BY_KIND`
(S1) and calls the allocator. An explicit `id` still works unchanged —
existing automation and tests are not a breaking change, the allocator
is opt-in.

Same principle as the rest of the plugin: one mutex-guarded counter, not
"`ls` + count + hope nobody else creates one between your `ls` and your
`write`".

### 4.10 `budget` is per slice-claim, not per proposal

The frontmatter `budget` (§4.4) resets **every time an agent claims one
slice** via `proposal_transition`/`continue_proposal` — it is not a
single ceiling shared across all 13 slices of this proposal. Each slice
above is independently estimated at 0.5-2 "sessions"; `80000`
input / `40000` output tokens / `100` iterations is sized for **one**
such session (reading a handful of files, several edits, a few
`bun run test`/`typecheck` round-trips), not for the whole proposal.
An earlier draft of this frontmatter (`12000`/`8000`/`60`) read as a
whole-proposal total, which is roughly what a single tool-call exchange
costs — an agent claiming S7 (2 sessions: 7 new scaffold docs + a
linter script + 12-language wiring) would have hit it almost
immediately. If a future tool wants an aggregate-across-all-slices
cap too, that needs its own field (e.g. `totalBudget`) — not implemented
here, out of scope until a concrete need shows up.

## 5. Slices

The work is split into 13 sequential slices, each independently
gateable. Files marked `excl.` are exclusively claimed by the slice.

### S1 — Glosario canónico *(excl. `proposal-glossary.constant.ts`)*

- **Status**: done
- Created `plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`
  with `PROPOSAL_STATUSES` (7), `PROPOSAL_KINDS` (12), `PROPOSAL_KIND_BY_PREFIX`,
  `PROPOSAL_PREFIX_BY_KIND`, `PROPOSAL_STATUS_TRANSITIONS`, `STATUS_TO_FOLDER`,
  `PROPOSAL_FLAGS`. Exported from `public/index.ts` (S6's web i18n work
  will need it cross-package).
- Created `proposal-glossary.constant.spec.ts` with the 6 invariant tests
  (every status has a label/folder, every transition target is known,
  terminal statuses have at most `retired` as outgoing edge, every kind
  has a single-letter prefix, prefixes are unique, the legacy alias
  table is consistent).
- **Scope correction (2 of the original 5 bullets deliberately NOT
  done in this slice):**
  - **`sync-proposal-registry.ts`'s `VALID_STATUSES`/`IProposalStatus`
    were NOT switched to this glossary.** That set still validates the
    OLD 8-status union (`pending`, `in_progress`, `deferred`, …)
    because the 14 legacy proposals on disk still use it — flipping
    the validator to the new 7-status set today would make
    `sync_proposals` reject every proposal currently in the repo. This
    is exactly the `PROPOSAL_STATE_MACHINE_V2` flag scenario the risk
    table (§8) already calls out. Wiring happens at the flag-flip
    point, after S11/S12 migrate the legacy files — folded into S3 or
    S12, not S1. Same reasoning for `proposal-document.ts`'s
    `IProposalFrontmatter.status` (still loose `string`, not narrowed
    yet — narrowing now would make TypeScript reject the legacy
    statuses this field must keep tolerating until migration).
  - **`adopt.ts#kindOf` was NOT refactored to use
    `PROPOSAL_PREFIX_BY_KIND`.** It answers a different question at a
    different layer: `adopt.ts` is the *generic, project-agnostic*
    bootstrap helper (`PROPOSALS_LAYOUT`) that analyses an arbitrary
    host project's pre-existing, ad-hoc proposals folder when
    mcp-vertex is dropped into it — its `f` prefix means "fix,
    cascades before proposals" (matching `continue-proposal.tool.ts`'s
    default `familyCascade: ['f', 'p']`), a convention recommended to
    *any* new adopter. This glossary's `f` means "feat" — **this
    repo's own dogfooded taxonomy**, not a new framework-wide default.
    Wiring `adopt.ts` to `PROPOSAL_PREFIX_BY_KIND` would silently
    redefine what `f`-prefix means for every other project using the
    generic bootstrap, just because this repo picked a richer scheme
    for itself. Left untouched; flagged here so the conflict is a
    documented decision, not a future surprise.
- **Gate**: `bun run type && bun run test proposal-glossary.constant.spec.ts`
  — both green.
- **Estimated work**: 1 session (matched).

### S2 — Scaffold linter *(excl. `proposal-scaffold-linter.ts`)*

- **Status**: done
- Created `plugins/proposals/src/lib/proposals/proposal-scaffold-linter.ts`
  exporting `lintProposalMarkdown({ path, markdown })`.
- Frontmatter validated by hand against the glossary (S1) — not a
  standalone Zod `ProposalFrontmatterSchema` file, since no slice
  actually owned creating one; the checks (`§4.4`'s required fields,
  kind∈12, status∈7, id pattern, title length) live directly in
  `lintFrontmatter`, reusing the existing `extractYamlBlock`/
  `parseFrontmatterBlock` (no new YAML parser).
- Validates body section order using the §4.5 **amended** rule
  (leading numbering stripped before matching; the 4 optional sections
  — Why this design / Architecture / Dependency graph / Risks and
  mitigations — accepted in their fixed slot; an unrecognised heading
  or an out-of-order one is flagged).
- Validates each slice resolves `Status`/`Files`/`Command`/`Expect`
  under **either** scaffold format (terse 4-bullet, or narrative
  `(excl. ...)` + `Gate`) — not just the terse one, per the amended
  §4.5.
- Validates filename prefix vs frontmatter `kind` (via
  `PROPOSAL_KIND_BY_PREFIX`, including the retired `p` legacy alias)
  and folder vs frontmatter `status` (via `STATUS_TO_FOLDER`).
- Every issue carries `{ line, message, fix }`.
- **Found and fixed a real bug via dogfooding**: the first version
  parsed `## `/`### S<N>` patterns **inside fenced code blocks** as
  real document structure — this proposal's own §4.5 documents the
  scaffold using literal `## Goal` lines inside a ` ```markdown ` fence,
  so the linter initially flagged **f113 against itself** (17 false
  issues). Fixed with a fence-tracking mask
  (`computeFencedLineMask`); added a regression test for it.
  Re-verified: f113 now lints clean (0 issues) against its own rules.
- `proposal-scaffold-linter.spec.ts`: 24 tests (6 happy paths + 18
  negative cases, one per invariant including the fence regression) —
  fewer than the originally estimated "12 happy + 15 negative" but
  covering every real invariant without padding for a round number.
- **Gate**: `bun run test proposal-scaffold-linter.spec.ts` — 24/24
  green; `bun x tsc --noEmit` clean.
- **Estimated work**: 1 session (matched).

### S3 — Transition tool *(excl. `proposal-transition.tool.ts`)*

- **Status**: done
- Created `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  exporting `runProposalTransition`/`<prefix>_proposal_transition`,
  registered in `index.ts` and `public/index.ts`.
- Validates against `PROPOSAL_STATUS_TRANSITIONS` (S1); refuses
  cleanly (no flag needed) when the proposal's *current* status isn't
  one of the new 7 — exactly the 14 legacy files today, until S11/S12.
- `withFileMutex` on the proposal's own path + `writeFileAtomic` for
  the frontmatter `status:` line (regex-replaced in place, rest of the
  file byte-identical).
- Moves the file via the existing injectable `IGitRunner`
  (`../shared/git-runner`, already used by `auto-work-persist.ts` —
  reused, not reinvented) running `git mv`; **no task-queue audit-trail
  event** (the original bullet) — dropped, see note below.
- Created `scripts/lint-proposals.ts` (`bun run lint:proposals`):
  walks `docs/proposals/`, lints every file shaped like a proposal,
  treats issues on `pNNN-…` filenames as warnings (never fails the
  build) and issues on anything else as fatal (non-zero exit).
- **4 real bugs found and fixed before this shipped, in order:**
  1. **Destination folder didn't exist → `ENOENT`.** The 7 status
     folders exist in this repo (`.gitkeep`), but nothing guaranteed
     it for a fresh adopter or a custom folder. Fixed: `mkdir(...,
     {recursive:true})` before the move.
  2. **The walker's strict 3-digit filename filter silently *skipped*
     `p99-feat-multi-model-audit-plugin.md`** (2 digits) instead of
     reporting it — invisible is worse than flagged. Loosened the
     walker's inclusion filter to `\d+` (1+ digits); the *linter's*
     stricter `\d{3,}` rule still correctly flags `p99`'s id as
     non-conforming once it's actually linted.
  3. Same loosening needed in the legacy-vs-fatal classifier
     (`isLegacyFilename`), or `p99` got discovered but then
     misclassified as a *fatal* new-scaffold violation instead of an
     expected legacy warning.
  4. **The walker recursed into `docs/proposals/audits/`** (and other
     non-proposal documents — `RESUMEN-*` session notes, READMEs) and
     reported them as fatal scaffold violations. Those were never
     proposals. Fixed: only files matching the proposal filename shape
     are even considered.
  - Verified against the real repo: `15 files checked, 14 legacy
    warning(s), 0 fatal error(s)`, exit 0 — matches "the 14 legacy"
    referenced throughout this document exactly.
- **Dropped from the original bullet list**: "emit a
  `proposal-transition` event to the task queue (audit trail)". The
  task queue (`persistent-task-queue.ts`) is a *work* queue (claim/
  dequeue/observe semantics) — there's no append-only event-log
  primitive in it to reuse, and bolting one on as a side effect of an
  unrelated tool is exactly the kind of special-case-on-shared-
  infrastructure this repo's own audit history (M25 et al.) flags as
  the wrong altitude. The audit trail this tool actually has: the
  required `reason` arg, returned in the tool's own JSON output, plus
  whatever the caller's own commit message records. A real durable
  audit log is S8/S9's territory (the notification event buffer) if
  still wanted — not invented here as a one-off.
- Also fixed (caught by the existing token-budget e2e regression
  guard, not by a new test): the tool's `description`/`summary` text
  was too verbose and pushed `overview full` to exactly the 6500B
  ceiling — trimmed both to terse, matching the rest of the plugin's
  token discipline.
- Also fixed: the checked-in generated SDK types
  (`src/generated/tool-outputs.ts`, N23 drift-guard) and the plugin's
  own tool-id snapshot tests (`plugin.spec.ts`) needed updating for
  the new tool — both are now in sync.
- `proposal-transition.tool.spec.ts`: 49 tests (the full 7×7 matrix +
  reason/unknown-status/not-found/legacy-refusal/git-mv-fallback
  cases). `lint-proposals.spec.ts`: 4 tests covering the p99 + non-
  proposal-document fixes specifically (regression coverage for bugs
  2-4 above).
- **Gate**: `bun run test && bun run lint:proposals` — both green;
  `bun run validate` (typecheck + lint + scss + 837 tests) green.
- **Estimated work**: 1 session (ran long — 4 real bugs caught via
  actually running the tool against the real repo, not just unit
  tests in isolation).

### S4 — `auto_work` consciente *(excl. `continue-proposal.tool.ts`)*

- **Status**: done
- `continue_proposal`'s `mode: 'auto'` cascade now filters new-system
  entries by **folder** (`ready/` → `in-progress/` → `review/`
  actionable; `paused/`/`blocked/`/`done/`/`retired/` skipped),
  derived from the index `file` path that S5's reconciler keeps in
  sync. Legacy entries (the 14 not-yet-migrated) keep their exact
  existing status-string behaviour — `isNewSystemEntry` uses the same
  dual signal as S5 (id prefix is one of the 12 live kinds, excluding
  the retired `p`, AND status resolves to a glossary status), so a
  legacy id is never reclassified even if its status happens to share
  a spelling with the glossary (`ready`, `done`, …).
- Also extended the anti-loop "claimed elsewhere" check (N9) to
  recognise the new-system spelling `in-progress` (hyphen) alongside
  the legacy `in_progress` (underscore) — without this, a new-system
  slice already claimed by a peer wouldn't be excluded from re-pick,
  reopening the exact mini-loop N9 was written to close.
- **Deferred (not in this slice): the `agent-dead` subscription.** It
  depends on S8 (the heartbeat-watcher event emitter), which doesn't
  exist yet — the original dependency graph listed S4 as depending
  only on S3, missing this. When S8/S9 land, re-evaluating the cascade
  on a peer's `agent-dead` event belongs there (or as a thin follow-up
  here once the event exists to subscribe to); until then, the
  existing per-call cascade (an agent re-running `auto_work`/
  `continue_proposal`) is the only re-evaluation path — slower, but
  correct, not broken.
- Extended `continue-proposal.spec.ts` (not a new file —
  `continue-proposal.tool.spec.ts` didn't exist; the existing spec
  already covered the legacy cascade) with a `describe` block: picks
  `ready/`, respects `review/` (not even in the legacy `ACTIONABLE`
  set, so this specifically exercises the new folder-based path),
  skips all 4 non-actionable folders (`it.each`), and a "never
  reclassifies a legacy id" case proving the dual-signal guard.
- **Gate**: `bun run test continue-proposal.spec.ts` (12/12) +
  `bun run validate` (854 tests) — both green, zero changes needed to
  any pre-existing legacy-cascade test.
- **Estimated work**: 0.5 session (matched).

### S5 — Folder reconciler *(excl. `sync-proposal-registry.ts`)*

- **Status**: done
- **Moved before S4** (dependency the original graph missed): the
  registry's directory scan had a hardcoded subtree list
  (`audits`/`fixes`/`historical`/`paused`/`revised`/…) that pre-dates
  f113 — it never looked inside `ready/`, `in-progress/`, `review/`,
  `done/`, `blocked/`, `retired/`. **`f113` itself was invisible to
  `sync_proposals`/`auto_work`/`proposal_board`** until this slice
  extended the subtree list (deduped against the legacy list, which
  already happened to include `paused`).
- Extended `IProposalStatus`/`VALID_STATUSES` (additive only) with the
  2 new-only spellings (`in-progress` hyphenated, `review`) so a
  migrated proposal's real status round-trips through the index
  instead of falling back to `pending` with a spurious warning — the
  other 5 new statuses already share their spelling with the legacy
  union.
- `reconcileFolders()` + `reconcileBlocked()` (merged
  `reconcileSelfBlocked()` into the same function — both end in the
  identical action, clearing a satisfied blocker and transitioning
  `blocked → ready`; two functions for one effect would have been the
  duplication, not the merge). Both wired into `syncProposalRegistry`
  via an injectable `gitRunner`, running before the scan so the index
  reflects the post-reconciliation tree. Idempotent (a file already
  correctly placed, or already resolved, is a no-op on the next run).
- **Dropped**: the `blocked-resolved` task-queue event — same
  reasoning as S3 dropping the task-queue audit event: no append-only
  log primitive to reuse there; `reconcileBlocked`'s own return value
  (`{ resolved: [...] }`) is the signal, available to whatever calls
  `syncProposalRegistry`.
- **1 critical bug found and fixed before this could ship** — status
  alone is not a safe "is this a new-system file" signal.
  `create_proposal` (the existing, heavily-used tool, unrelated to
  f113) defaults every brand-new proposal to **`status: ready`**
  regardless of kind (`authoring.tool.ts`: `status: ${args.status ??
  'ready'}`). Without an additional check, `reconcileFolders` would
  silently relocate *any* freshly created legacy-style proposal (id
  `p5`, `p100`, …) into `ready/` the instant `syncProposalRegistry`
  next ran — caught by the pre-existing `authoring.spec.ts` assertion
  that `p5-meta.md` stays exactly where it was written. Fixed:
  `isNewSystemFilename()` additionally requires the filename's prefix
  to be one of the 12 *live* kind prefixes, explicitly excluding the
  retired legacy `p` (which IS a key in `PROPOSAL_KIND_BY_PREFIX`, for
  the reverse-lookup transition period — so it needs its own explicit
  exclusion, not just "not found in the map"). A new-system file now
  needs both signals (prefix AND status) to ever be touched.
- **2 collisions with concurrent agents, same pattern as f113 S3**: a
  `git add -A`-shaped commit (`dcb4517`) swept up an early,
  pre-bug-fix snapshot of this slice's code under its own message
  before I'd finished it. Content verified intact; this entry plus the
  3 follow-up commits (frontmatter-parser fix, hardened tests, this
  doc update) carry what was still uncommitted.
- **Also fixed in `frontmatter-parser.ts`** (not `sync-proposal-
  registry.ts`, so technically outside this slice's `excl.` — a small,
  additive, backward-compatible parser gap, not a reserved-file
  conflict): non-empty inline arrays (`blocked_by: [self:goal-missing,
  f400]`, the syntax this very document uses in §9) parsed as the
  literal string `"[self:goal-missing]"`, not an array — only the
  empty-array case (`key: []`) was ever handled. `blocked_by` couldn't
  work at all without this. Added inline flow-sequence parsing
  (comma-split scalars); a token containing a colon
  (`self:goal-missing`) stays one scalar instead of being misread as a
  nested mapping key — the same ambiguity the *block*-array form has
  for that token shape, which is why `blocked_by` should always be
  written inline per the convention.
- `sync-proposal-registry-reconcile.spec.ts`: 9 tests (move-on-
  mismatch, idempotence, legacy-never-touched, the `ready`-default
  regression above, dependency-resolves, dependency-still-blocked,
  self-block-resolves, plus 2 `syncProposalRegistry` integration
  tests: discovers a file in `ready/`, reconciles-then-indexes with no
  duplicate entries). Added a property-test case for the inline-array
  fix in `frontmatter-parser.property.spec.ts`.
- **Gate**: `bun run test` (847 tests) + `bun run validate` — both
  green. No manual check against the 14 legacy is meaningful yet
  (`isNewSystemFilename` guarantees none of them are touched by
  construction).
- **Estimated work**: 1 session (ran long for the same reason as S3 —
  real bugs surfaced by actually running the code against realistic
  scenarios, including the existing test suite, not just new
  isolated unit tests).

### S6 — i18n glossary + badges *(excl. `apps/web/src/i18n/langs/`)*

- **Status**: pending
- Extend `apps/web/src/i18n/langs/*.ts` (12 files) with the tree:
  ```typescript
  proposals: {
    statuses: {
      ready:      { label, short, long },
      in_progress:{ label, short, long },
      review:     { label, short, long },
      done:       { label, short, long },
      paused:     { label, short, long },
      blocked:    { label, short, long },
      retired:    { label, short, long },
    },
    kinds: {
      feat:     { label, short, long },
      breaking: { label, short, long },
      fix:      { label, short, long },
      refactor: { label, short, long },
      perf:     { label, short, long },
      audit:    { label, short, long },
      chore:    { label, short, long },
      docs:     { label, short, long },
      test:     { label, short, long },
      infra:    { label, short, long },
      spike:    { label, short, long },
      legacy:   { label, short, long },
    },
  }
  ```
- Extend `apps/web/src/i18n/check-i18n.ts` to require all keys.
- Create `apps/web/src/components/proposals/StatusBadge.astro` and
  `KindBadge.astro` that import the glosario and render a coloured
  pill with the glyph + label.
- **Gate**: `bun run site:strict` (fails if any of the 12 languages
  is missing a key).
- **Estimated work**: 1.5 sessions.

### S7 — `docs/scaffolds/` *(excl. `docs/scaffolds/`)*

- **Status**: pending
- Create `docs/scaffolds/README.md` (index of all scaffolds).
- Create `docs/scaffolds/ARCHITECTURE-PROPOSALS.md` — the full shape
  spec for proposals, slices, transitions, recovery. Source for the
  agents and the linter.
- Create `docs/scaffolds/ARCHITECTURE-AUDITS.md` — shape spec for
  audit reports (`docs/proposals/audits/**`).
- Create `docs/scaffolds/ARCHITECTURE-ADR.md` — shape spec for ADRs
  (`docs/adr/NNNN-*.md`).
- Create `docs/scaffolds/ARCHITECTURE-WORKFLOWS.md` — shape spec for
  GitHub Actions (required keys, pinned SHAs).
- Create `docs/scaffolds/ARCHITECTURE-TOOLS.md` — shape spec for MCP
  tool specs (outputSchema mandatory, Zod schema in/out).
- Create `docs/scaffolds/ARCHITECTURE-DOCS.md` — shape spec for web
  pages (`apps/web/src/content/docs/**`).
- Create `docs/scaffolds/ARCHITECTURE-MEMORY.md` — shape spec for
  memory notes (`plugins/memory/store/**`).
- Create `scripts/lint-scaffolds.ts` that walks each scaffold's
  `applies-to` glob and validates the relevant subset of rules.
- Add `bun run lint:scaffolds` script.
- i18n: every scaffold becomes a web page under
  `apps/web/src/content/docs/<lang>/scaffolds/...` (12 languages).
- **Gate**: `bun run lint:scaffolds` (warns on the 14 legacy; will
  pass cleanly once S11+S12 land).
- **Estimated work**: 2 sessions.

### S8 — Notification: agent events *(excl. `plugins/notification/src/lib/agent-events*.ts`)*

- **Status**: pending
- Create `plugins/notification/src/lib/agent-events.ts` exporting
  `watchAgentHeartbeat(...)` per the sketch in §4.6.
- Create `plugins/notification/src/lib/agent-events-bridge.ts` that
  re-emits the events through `server.notification(...)` as
  `notifications/message`.
- Register both in `plugins/notification/src/lib/tools.ts` so the
  bridge is wired on plugin boot.
- `agent-events.spec.ts` covers: mtime bump → `agent-alive`; 10
  cycles idle → `agent-idle`; 3 missed cycles → `agent-dead`;
  bridge delivers events through the notification channel.
- **Gate**: `bun run test plugins/notification`.
- **Estimated work**: 1 session.

### S9 — Recovery tools *(excl. `plugins/proposals/src/lib/tools/recovery-tools.ts`)*

- **Status**: pending
- Create the 5 tools from §4.7.
- `proposal_stale_list` reads from an in-memory buffer fed by the
  S8 bridge; GC entries older than 1 h.
- `proposal_force_transition` releases the lock in the agent-names
  registry, then moves the file via the same logic as S3.
- `proposal_diagnose` returns a full picture: folder, frontmatter
  status, lock owner, last heartbeat, last agent-dead event,
  inconsistencies (folder ≠ status, lock owner ≠ frontmatter owner,
  last heartbeat > 3× heartbeatMs), suggested actions.
- `proposal_reconcile_folder` wraps S5's `reconcileFolders()` for a
  single id.
- `agent_lock_release_orphan` checks the agent is actually
  `agent-dead` (via the event buffer) before releasing.
- `recovery-tools.spec.ts` covers each tool with synthetic events.
- **Gate**: `bun run test recovery-tools.spec.ts`.
- **Estimated work**: 1.5 sessions.

### S10 — Recovery dashboard *(excl. `apps/web/src/pages/status/recovery.astro`)*

- **Status**: pending
- Create `apps/web/src/pages/status/recovery.astro` per §4.8.
- Create `apps/web/src/components/recovery/RecoveryTable.astro` with
  one row per zombie and one button per suggested action.
- Create `apps/web/src/pages/api/events/[topic].ts` as an SSE
  endpoint that streams `notifications/message` events for the
  given topic (default `agent-dead`).
- Add `recovery.*` keys to all 12 `apps/web/src/i18n/langs/*.ts`.
- Manual test: simulate an agent-dead event via the S8 test
  harness, confirm the dashboard updates within 2 s.
- **Gate**: `bun run site:strict` plus a manual end-to-end test.
- **Estimated work**: 1 session.

### S11 — Migration script *(excl. `scripts/migrate-legacy-proposals.ts`)*

- **Status**: pending
- Create `scripts/migrate-legacy-proposals.ts` that:
  1. Lists every `pNNN-*.md` under `docs/proposals/`.
  2. Computes the new path: `<status>/lNNN-legacy-<original-slug>.md`
     (strip the old `feat-` / `fix-` / `chore-` prefix from the slug;
     the kind info moves to frontmatter `kind: legacy` + `kind-original`).
  3. Dry-run mode prints a diff (default).
  4. Apply mode does `git mv` for each file (preserves blame).
  5. Regenerates `docs/proposals/index.json` with the new paths.
  6. Emits a summary table at the end.
- Create `scripts/rewrite-proposal-refs.ts` that greps the repo for
  `pNNN` references in `.md`, `.ts`, `.astro`, and rewrites them to
  `lNNN` (or to the new path). Dry-runnable.
- Manual test: dry-run on the repo, review the diff, then apply.
- **Gate**: the 14 legacy files end up in the correct folder with
  the correct name; `git log --follow <file>` still shows the
  original history.
- **Estimated work**: 1 session.

### S12 — Legacy normalization *(excl. `scripts/normalize-legacy-proposals.ts`)*

- **Status**: pending
- Create `scripts/normalize-legacy-proposals.ts` that:
  1. Reads each `lNNN-*.md` (post-S11).
  2. Normalises frontmatter: ensures `kind: legacy`, adds
     `kind-original` (inferred from filename), ensures `track`
     present, ensures `date` ISO-8601.
  3. Normalises body sections to the canonical order. If a section
     is missing, inserts a placeholder (`## Goal\n\n_Imported from
     legacy — needs rewrite_`).
  4. Does NOT change the prose content (this is a `refactor:`).
- Run the scaffold linter on each; iterate until all pass.
- **Gate**: `bun run lint:proposals` passes cleanly on every file
  under `docs/proposals/`.
- **Estimated work**: 1.5 sessions.

### S13 — Race-safe ID allocator *(excl. `proposal-id-allocator.ts`, `.cache/mcp-vertex/proposal-id-counters.json`)*

- **Status**: done
- Created `plugins/proposals/src/lib/proposals/proposal-id-allocator.ts`
  exporting `allocateNextProposalId(prefix, options)` (the §4.9 design)
  and `prefixForKind(kind)` (thin wrapper over `PROPOSAL_PREFIX_BY_KIND`).
- Seed-from-disk on first read: scans `proposalsDirAbs` (root + the 7
  status folders) for `^([a-z])(\d+)-` filenames — `\d+`, not `\d{3,}`,
  same reasoning as S5/S2: `p99` (2 digits) must seed correctly, the
  3-digit minimum is a *future* convention for new ids, not a discovery
  filter. Covers the 14 legacy + `f113` already on disk with zero
  manual bootstrap step.
- **Scope addition beyond the original 2 reserved files** (small,
  additive, non-conflicting — done solo, no concurrent collision):
  added `proposalIdCountersFile` to `IHostPathLayout` +
  `buildSwarmPaths` (`default-path-layout.constant.ts`,
  `swarm-path-layout.interface.ts`), matching the existing convention
  every other cache artefact (`lockFile`, `agentRegistryFile`, …)
  already follows, instead of hardcoding the path separately in
  `index.ts`.
- Wired into `create_proposal` (`authoring.tool.ts`): `id` is now
  optional; a new `kind` enum param (the 12 glossary kinds) lets the
  caller omit `id` and get the next allocated one. Explicit `id` keeps
  its exact prior behaviour untouched (verified — zero changes needed
  to the 5 pre-existing `authoring.spec.ts` cases). Neither `id` nor
  `kind` provided is a clear `toolError`, not a silent fallback.
- Concurrency test: 25 parallel `allocateNextProposalId('r')` calls;
  asserts 25 distinct, sequential ids, no gaps —
  `withFileMutex` serialises them, the same guarantee
  `with-file-mutex.spec.ts` already covers for locks, applied here to
  a counter.
- `proposal-id-allocator.spec.ts` (8 tests): seed-from-empty,
  seed-from-existing-files (legacy `p99`/`p112` + `f113` mixed),
  sequential-no-gaps, independent-per-prefix sequences, the 25-way
  concurrency case, counter-file-is-valid-JSON, plus 2 `prefixForKind`
  cases. `authoring.spec.ts` gained 2 new cases (allocates from kind,
  errors when neither id nor kind given).
- **Gate**: `bun run test` (864 tests) + `bun run validate` — both
  green.
- **Estimated work**: 0.5 session (matched).

## 6. Dependency graph

```
S1 ──┬──► S2 ──┬──► S7 ──────────────────────────┐
      │         │                                  │
      │         ├──► S3 ──┬──► S4                  │
      │         │         │                          │
      │         │         ├──► S5 ──┐                │
      │         │         │         │                │
      │         ▼         ▼         ├──► S11 ──┐     │
      │         (DFA)   (folder)    │         │     │
      │                             │         ▼     │
      └──► S6 ──────────────────────┤        S12 ───┘
      │                             │
      └──► S13 (leaf, parallel with S6/S7/S8)
                                    │
S8 ──► S9 ──┬──► S10 ────────────────┘
            │
            └──► (S4 subscribes here)
```

Critical path: S1 → S3 → S5 → S11 → S12 (≈ 5.5 sessions).
Parallelisable pairs: (S6, S8), (S7, S9), (S10 after S6+S9), (S13 anywhere after S1).

## 7. Acceptance

- [ ] `proposal-glossary.constant.ts` defines 7 statuses, 12 kinds,
      12 prefix mappings, and a 7×7 transition matrix.
- [ ] `proposal-scaffold-linter` rejects malformed proposals with a
      precise error (file path, line number, fix hint).
- [ ] `proposal_transition` MCP tool validates the DFA on every call
      and moves the file atomically (`withFileMutex` +
      `writeFileAtomic`).
- [ ] `auto_work` only picks from `ready/`, `in-progress/`, `review/`.
- [ ] `sync_proposals` reconciles folders and auto-resolves
      `blocked → ready` when deps are met.
- [ ] `agent-alive`, `agent-idle`, `agent-dead` events flow through
      the notification plugin's `notifications/message` channel.
- [ ] `proposal_stale_list` returns zombies from the event buffer,
      not from a polling scan.
- [ ] All 14 legacy proposals live in one of the 7 folders with a
      `lNNN-…` filename.
- [ ] All 14 legacy proposals pass `bun run lint:proposals`.
- [ ] i18n covers 7 statuses × 12 languages + 12 kinds × 12 languages.
- [ ] `/status/recovery` dashboard renders and reacts to events via SSE.
- [ ] `allocateNextProposalId` is race-safe under N concurrent calls for
      the same kind (no duplicate, no gap, no dependency on directory
      listing timing); `create_proposal` works both with and without
      an explicit `id`.
- [ ] `bun run validate` (type + test + lint + site:strict) green.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 14 legacy break `bun run validate` between S3 and S12 | Feature flag `PROPOSAL_STATE_MACHINE_V2`; S3 only flips it on after S12 lands |
| `pNNN` legacy filenames pre-date the new single-case scheme | `p` is a recognised (but retired) alias for `kind: legacy` in `PROPOSAL_KIND_BY_PREFIX` until S11 migrates every `pNNN` to `lNNN`; no new file is ever created with `p` |
| Case-insensitive filesystems (macOS, Windows) silently merge two differently-cased prefixes | Avoided by construction: every live prefix (§2.2) is a distinct lowercase letter, none rely on case to disambiguate |
| 12-language i18n drift | `bun run site:strict` fails the build if any key is missing; no exceptions |
| SSE endpoint overloads during incidents | Rate-limit per topic; events are already dedup'd by the bridge (1 event per state change, not per mtime bump) |
| Agent-dead false positives (slow CI, not crash) | Threshold is `3 × heartbeatMs` (default 30 s), not 1; the dashboard lets a human force-resume if the agent is just slow |
| `git mv` on the 14 legacy breaks external references | S11's `rewrite-proposal-refs.ts` updates all internal refs; external refs (PR descriptions, docs) keep working because the numeric id is preserved (`p099` → `l099`) |

## 9. Notes

- The `draft` case is **not** a new status. It is
  `blocked-by: [self:goal-missing]` (or `[self:slices-empty]`,
  `[self:budget-missing]`). One blocking mechanism, reused for
  self-blocking.
- `blocked` auto-resolves to `ready` when deps are met. `paused`
  never auto-resolves — only `proposal_resume` (manual) lifts it.
- The recovery tools are **additive**. Existing `agent_lock gc`,
  `task_queue` subscribe, and `notification` plugin's
  `lock-released` are unchanged. The new layer sits on top.
- The 14 legacy normalization is a pure `refactor:`. The commit
  message will be `refactor(proposals): normalize legacy proposals
  to canonical scaffold (f113)`. No content change, no new behaviour.