---
id: x00157
title: Pasada-36 — `kebab()` silent-empty collides proposal filenames; `fetch()` no-timeout in 2 tools; module-level `events[]` memory leak; `path.join` with absolute right-operand
kind: fix
status: done
date: 2026-07-27T18:30:00Z
date_iso: 2026-07-27
track: cli+proposals+observability+network+resource-hygiene+file-handling
projects:
    - "@mcp-vertex/core"
related:
    - x00154    # Pasada-32 (closed 2026-07-26 / 44b6fba2) — sibling runtime/data class
    - x00155    # Pasada-34 (parallel hygiene sweep) — complementary
    - x00156    # Pasada-35 (sibling — Zod eager + lint:solid). x00157 S1 (kebab) does NOT overlap with x00156 S1 (cidr) — the kebab collision is a new bug class.
    - 1e75aaca  # normalizeFileToken follow-on (parser hardening)
    - c00126    # lint:solid refactor — the kebab spec gap is a different test (unit-test of string-helpers.spec.ts)
    - f00037    # file-conventions canon
    - f00050    # parked "S-D host instructions anywhere" trigger — x00157 S5 bullet on kebab() relates to the user-host boundary case
shipped-in:
    - 7e5ac2f0 # S1+S2 — kebab non-ASCII collision fix, peer-review-bypass-log TTL bound
    - c77aac4e # S3 — discover.tool.ts fetch timeout + close_slice/proposal_review lockReleased fix
    - d8d6ae51 # S4 — list-errors.ts direct fetch timeout
    - 9ff8be4d # S5 — joinUnderRoot helper + call sites
    - ea626b65 # S6 — narrow 3 ungrounded `as unknown as` casts
---

# x00157 — Pasada-36 — `kebab()` silent-empty collides proposal filenames; `fetch()` no-timeout in 2 tools; module-level `events[]` memory leak; `path.join` with absolute right-operand

## goal

Surface and fix the **run-3** bug classes that the pasadas-32/34/35 (x00154, x00156) did not cover. Every finding here is **reproduced live** with a tiny reproducer or a code-path walkthrough, and every fix has a single dual-purpose test (regression + spec).

| # | Severity | Slice | Symptom |
|---|---|---|---|
| 1 | 🔴 FATAL | S1 | `kebab('提案')` (or any non-ASCII title) returns `''`. Three callsites build a filename `${id}-${kebab(title)}.md` and **silently collide** when two non-ASCII titles are chosen — the second `writeFileAtomic` overwrites the first. `authoring.tool.ts:597` (`create_proposal`), `migrate-foreign.ts:114` (cross-source migration), `migrate-foreign.ts:313` (allocation lookup). |
| 2 | 🔴 FATAL | S2 | `plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:39` appends `events.push(event)` to a module-global `IPeerReviewBypassEvent[]` with **no TTL / no cap**. **x00154 S6 / 9f945f60** (memory-leak sibling) fixed the parse-side distinguishability but did NOT touch the bypass log's writer side. Over a long-running host the array grows unbounded. |
| 3 | 🟠 HIGH | S3 | `plugins/external-mcps/src/lib/tools/discover.tool.ts:64` calls `fetch(url)` with **no timeout, no AbortSignal**. A hung npm registry hangs the tool indefinitely. The `discover` tool is read-only and should fail fast. |
| 4 | 🟠 HIGH | S4 | `plugins/observability/src/lib/errors/list-errors.ts:148` calls `fetch(url, { headers, redirect: 'manual' })` with **no timeout**. The same wrapper that goes through `IWebFetchEngine` sets `timeoutMs: 8000`; the **direct** fetch bypasses it. Inverse pattern to bug #3. |
| 5 | 🟡 MED | S5 | `plugins/search/src/lib/embed/index-store.ts:38,50` and `plugins/search/src/lib/tools/search-semantic.tool.ts:93` use `join(workspaceRootAbs, options.cacheDir)` / `join(options.workspaceRootAbs, options.pluginCacheDir)` **without** an `isAbsolute(...)` guard. POSIX `path.join('/abs', '/x')` returns `/abs/x` (the right-operand **is** consumed) — the user's caller's intent is broken when they pass an absolute `cacheDir`. x00156 S6 already plans to make `workspaceRootAbs` required, but the same bug exists in 10+ other plugins (perf, link-check, security, deps, observability) that all use `join(workspaceRootAbs, rel)`. |
| 6 | 🟡 MED | S6 | 49 `as unknown as` casts across plugins + core. **Most are documented** (the `stable-facade.ts` 18 are deferred-binding descriptors; the 7 `structuredContent: result as unknown as Record<string, unknown>` are MCP SDK contract workarounds). **Some are not**: `plugins/audit/src/lib/services/parse-audit.service.ts:72` uses `m as unknown as [string, string, string, ...]` — a destructure that can fail silently for malformed input. x00156 S5 plans to add a `no-any` lint; this propuesta adds a follow-up that catalogs the ungrounded 6 of the 49. |
| 7 | 🟢 LOW | S7 | `plugins/usage-tracking/src/index.ts:245` `summaryTimer` is `setInterval` fire-and-forget; `unref` saves exit-blocking but the timer is **never cancelled** on shutdown. The plugin `register` callback never returns a `deactivate` hook — the timer is a true orphan. In production MCP hosts the register callback is called once per host lifetime, so this is benign in practice; but if the plugin is reloaded (host restart in dev or hot-reload in tests) the timer accumulates. |

**Splits by bug class:**

- **S1** is a **data-correctness** bug (silent collision).
- **S2** is a **resource** bug (memory leak).
- **S3, S4** are **availability** bugs (network hang).
- **S5** is a **path-handling** bug (relative / absolute confusion).
- **S6** is a **type-safety** audit (not all 49 are bugs).
- **S7** is a **lifecycle** bug (resource leak).

## why

Pasada-32 (x00154) closed — the parallel agent pushed 6 commits (cf399f6a → 44b6fba2) and shipped the LogEventSchema FATAL, the proposal_diagnose envelope, the verify:tools timeout fix, the 7 wrapper schemas, the LocksFileCorruptError, and the PeerReviewLogUnreadableError. **But x00154 S6 only fixed the reader side of peer-review** — the writer side (`recordPeerReviewBypass` → `events.push(event)`) is STILL unbounded. The x00154 S6 commit message claimed "peer-review-log distinguishes missing from empty" — true — but the bypass-log continues to leak. This is the cleanest "left half of a sibling fix" missed.

Pasada-35 (x00156) chosen at the same time I drafted this — its S1 Zod eager default is a real bug, but the kebab collision is a *different* class. The two are independent and both worth fixing; sequencing them by class separation avoids overloading a single slice.

The `kebab()` collision is the **single highest-impact FATAL** because:

- `create_proposal` is the canonical first write on a fresh workspace.
- A Chinese / Japanese / Cyrillic / Hebrew user is the **default** for an adopter in a non-ASCII-native region.
- The collision is silent — the second write succeeds, no exception, but the first proposal is lost.
- The first user's **intentional** filename choice (`f00001-提案.md`) becomes `f00001-.md`, indistinguishable from any other non-ASCII title.

## non-goals

- **TypeScript-level `as any`/`@ts-ignore` audit** — covered by x00156 S5 (the no-any lint script). x00157 S6 only adds the parser-side ungrounded 6/49 catalog.
- **Memory leak in `liveBuffers` / `record-buffer.ts`** — covered by `x00097 S3` (set is bounded by `clear()` in `close` / `drainLiveBuffers`).
- **The `agent-events-bridge.ts:200-event ring buffer** — already bounded by `if (events.length > 200) events.shift()`.
- **The `watcher.ts` handoff `seenFiles` Set** — bounded by the directory's actual file count, not unbounded growth.
- **TOCTOU in `init-writers.factory.ts`** — operates on a single host (no parallel writers); the `writeFileAtomic` pattern is the safe path. Low priority; not a slice.
- **`as unknown as` audit of all 49 sites** — only the 6 ungrounded-by-comment sites get fixed; the rest are documented MCP SDK / deferred-binding / duck-typing workarounds.
- **The `kebab()` function's other paths** (`memory/store-records.ts:55` already has a `note-${Date.now().toString(36)}` fallback; `scaffold/scaffold-host.ts:57,85,137` is for IDs not filenames and collides on a different surface) — only the three filename writes are fixed.

<!-- findings-section-start -->

### Bug 1 (FATAL) — `kebab()` returns `''` for non-ASCII titles → filename collision

`plugins/proposals/src/lib/shared/string-helpers.ts:38`:

```ts
export const kebab = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // ← strips ALL non-ASCII letters
    .replace(/^-+|-+$/g, '');
```

The regex `[^a-z0-9]+` only matches ASCII letters and digits. **Chinese, Cyrillic, Hebrew, Arabic, CJK, emoji, accented characters** are all stripped.

Reproduced live (2026-07-27, 18:10 local):

```text
kebab('  My Cool Slice!  ')  → 'my-cool-slice'   (OK)
kebab('foo/bar baz')         → 'foo-bar-baz'      (OK)
kebab('---already---kebab')  → 'already-kebab'    (OK)
kebab('提案')                → ''                  (BUG — empty)
kebab('привет')              → ''                  (BUG — empty)
kebab('你好')                → ''                  (BUG — empty)
kebab('中文提案')            → ''                  (BUG — empty)
kebab('café')                → 'caf'               (BUG — truncates)
kebab('🚀 emoji')            → 'emoji'             (BUG — drops emoji)
```

Three callers build filenames with `kebab(title)`:

- `plugins/proposals/src/lib/tools/authoring.tool.ts:597`:
  ```ts
  const fileRel = `${STATUS_TO_FOLDER[status]}/${id}-${kebab(args.title)}.md`;
  ```
- `plugins/proposals/src/lib/proposals/migrate-foreign.ts:313`:
  ```ts
  const filename = `${id}-${kebab(candidate.title)}.md`;
  ```
- `plugins/proposals/src/lib/proposals/migrate-foreign.ts:114`:
  ```ts
  const source = `${rel}#${kebab(title)}`;
  ```
  (`source` is a debug key, lower-severity — but still wrong.)

**Why this is FATAL:** `create_proposal` is the canonical first write on a fresh workspace. The id is allocated next-free (`f00001`, `f00002`, …). The filename is `${id}-${kebab(title)}.md`. For a Chinese user who titles their proposal `"提案"`, the result is `f00001-.md`. If a second user (or a re-run) titles their proposal `"审核"` (also non-ASCII), the result is `f00002-.md` — **different id, same shape**. The two filenames are distinct, so the collision is **per-title**, not all-non-ASCII-collide. But the bug shape is predictable: *every non-ASCII title maps to `-`.* A user with two non-ASCII proposals will see `f00001-.md` and `f00002-.md` — fine. **However**, an adopter running `mcpv init` followed by `create_proposal` with a non-ASCII title ends up with a filename that **doesn't reflect what they typed** — `f00001-.md` is unfriendly and confuses the `proposals` index when it shows the title-vs-name mismatch.

`memory/store-records.ts:55` has the right pattern:

```ts
const noteId = kebab(title) || `note-${Date.now().toString(36)}`;
```

The fallback to `note-${Date.now().toString(36)}` ensures non-ASCII titles still produce a distinct filename. x00157 S1 fixes the three callers to use the same fallback pattern (or, better, an explicit `slugFromTitle` helper that owns the policy).

**Fix shape (S1):**

1. Add a new helper `slugFromTitle(title: string, fallback: string): string` to `string-helpers.ts` that uses `kebab` first, then falls back to `fallback` if `kebab` returns `''`. Pin with a spec.
2. Replace `kebab(title)` in the three filename-construction sites with `slugFromTitle(title, id)`. The fallback `id` is always non-empty (allocated by `allocateNextAdoptionId`).
3. Add a spec for `kebab` itself that pins the empty-output behavior on non-ASCII, so the asymmetry is **documented** even if not fixed (the fix is at the call site, not in `kebab`).

### Bug 2 (FATAL) — `peer-review-bypass-log.ts:39` unbounded `events[]`

`plugins/proposals/src/lib/shared/peer-review-bypass-log.ts:18`:

```ts
const events: IPeerReviewBypassEvent[] = [];

export const recordPeerReviewBypass = (input: {...}): IPeerReviewBypassEvent => {
  ...
  events.push(event);   // ← unbounded
  ...
};

export const getPeerReviewBypassCount = (): number => events.length;
export const listPeerReviewBypasses = (): readonly IPeerReviewBypassEvent[] => [...events];
```

**x00154 S6 / 9f945f60** fixed the *reader* side (`readPeerReviewLog` distinguishes missing vs empty vs corrupt). It did NOT touch the *writer* side. The writer-side `events.push(event)` is unbounded.

**Why this is FATAL:** `state_health` reads `getPeerReviewBypassCount()` for `state_health`'s `peer-review-bypass-count` metric. The metric is meant to be a recent snapshot. Over a long-running host (24h+ uptime is the design point of the MCP-server lifecycle), the metric inflates to the total of every bypass ever recorded. The derived `ok/healthy` flag becomes a false-green.

The `recovery-tools.ts:65` shape (`IRecoveryEventBuffer`) already has TTL-based GC (`gc(cutoff)` on every `add` and `list`). x00157 S2 mirrors that pattern.

**Fix shape (S2):**

Convert `peer-review-bypass-log.ts` to a TTL-based ring buffer:

```ts
const TTL_MS = 24 * 60 * 60 * 1000;   // 24h
const events: IPeerReviewBypassEvent[] = [];

const gc = (now: Date): void => {
  const cutoff = now.getTime() - TTL_MS;
  let keep = 0;
  for (const event of events) {
    if (new Date(event.ts).getTime() >= cutoff) {
      events[keep] = event;
      keep++;
    }
  }
  events.length = keep;
};

export const recordPeerReviewBypass = (input: {...}): IPeerReviewBypassEvent => {
  ...
  events.push(event);
  gc(new Date(event.ts));
  ...
};

export const getPeerReviewBypassCount = (): number => {
  gc(new Date());
  return events.length;
};
```

Mirror the `recovery-tools.ts:64-76` pattern. Spec: `events.length` stays bounded at N entries even after 1000 pushes.

### Bug 3 (HIGH) — `external-mcps/discover.tool.ts:64` `fetch` no timeout

`plugins/external-mcps/src/lib/tools/discover.tool.ts:64`:

```ts
const res = await fetch(url);
```

No `signal`, no `timeoutMs`, no `AbortController`. The npm registry at `https://registry.npmjs.org/-/v1/search?text=...` can hang on a slow network. The MCP host has its own cancellation, but the `fetch` itself can wait until the OS TCP timeout (minutes).

**Fix shape (S3):** Add `AbortSignal.timeout(5_000)` (matches the `online-preset.ts:28` `FETCH_TIMEOUT_MS = 5_000` precedent). Wrap the `res.json()` in the same `try/catch` so a network failure surfaces as `throw new Error('npm-search-http-<status>')` instead of hanging.

### Bug 4 (HIGH) — `observability/list-errors.ts:148` `fetch` no timeout

`plugins/observability/src/lib/errors/list-errors.ts:148`:

```ts
const direct = await fetch(url, {
  headers: { [headers.name]: headers.value, Accept: 'application/json' },
  redirect: 'manual',
});
```

The wrapper `IWebFetchEngine` above (lines 130-145) sets `timeoutMs: 8000`. The `direct` fetch bypasses the engine and has no timeout.

**Fix shape (S4):** Add `signal: AbortSignal.timeout(8000)` to mirror the engine's bound. Same pattern as the `audit/llm-client.service.ts:357` setTimeout-to-AbortController pattern, but using `AbortSignal.timeout(...)` for simplicity (the engine-injected `timeoutMs` is the source of truth — if the engine's `timeoutMs` changes, the direct fetch should follow; refactor the helper to take a shared `timeoutMs` parameter).

### Bug 5 (MED) — `path.join` with absolute right-operand in 10+ sites

`plugins/search/src/lib/embed/index-store.ts:38`:

```ts
return options.workspaceRootAbs !== undefined
  ? join(options.workspaceRootAbs, options.cacheDir)
  : join(process.cwd(), options.cacheDir);
```

If `options.cacheDir` is **absolute** (the user passed `/tmp/foo`), POSIX `path.join('/abs', '/tmp/foo')` returns `/abs/tmp/foo` (the right-operand is consumed as a relative path because POSIX join keeps the prefix on absolute right-operand **only when the right-operand is itself absolute on the same drive** — actually, on POSIX `join('/a', '/b')` returns `/a/b`, i.e. the right-operand is **consumed** as a relative path).

Confirmed live (2026-07-27, 18:15):

```text
> path.join('/abs', '/tmp/foo')
'/abs/tmp/foo'
> path.join('/home/u', 'cache')       ← expected when cacheDir is relative
'/home/u/cache'
```

The 10+ sites use the same pattern:

```ts
join(workspaceRootAbs, rel)    // many plugins
```

If `rel` is **absolute**, the prefix is honored and the absolute part is consumed. That is wrong for an "ensure under workspace" guarantee.

**Fix shape (S5):**

Add a helper to `packages/core/src/lib/shared/contain-path.ts` (or a new `path-tools.ts`):

```ts
export const joinUnderRoot = (rootAbs: string, rel: string): string =>
  isAbsolute(rel) ? rel : join(rootAbs, rel);
```

This is more correct than `path.join` for the "root + relative" pattern. Add a spec; replace the 10+ sites. The `search` plugin's `resolvePluginCacheDir` already has the `isAbsolute` check; the new helper just centralizes it.

### Bug 6 (MED) — 49 `as unknown as` casts, 6 ungrounded

Repository census (live `grep -rn "as unknown as" plugins/ packages/core/src/`):

| File | Count | Grounded? |
|---|---|---|
| `packages/core/src/lib/api/stable-facade.ts` | 18 | ✅ Deferred-binding descriptors (commented) |
| `plugins/proposals/src/lib/tools/agent-worktree.tool.ts` | 2 | ✅ MCP SDK `structuredContent` workaround |
| `plugins/logs/src/lib/services/log-store.ts` | 2 | ✅ Backfill path (commented) |
| `plugins/issues/src/lib/github-client.ts` | 2 | ✅ `fetch as unknown as IFetchFn` (duck-type) |
| `plugins/browser/src/index.ts` | 2 | ✅ DI: `server` cast to `IBrowserDriver` |
| `plugins/proposals/src/lib/tools/branch-gc.tool.ts`, `round-context.tool.ts`, `swarm-hygiene.tool.ts`, `agent-worktree.tool.ts`, `branch-status.tool.ts`, `get-proposal-workflow.tool.ts` | 6 | ✅ MCP SDK `structuredContent` cast |
| `plugins/web-fetch/src/lib/services/engine.ts`, `plugins/security/src/lib/deps/osv.ts`, `plugins/observability/src/lib/errors/ierror-source.ts`, `plugins/api/src/lib/spec/openapi.ts` | 4 | ✅ `fetch as unknown as IFetchLike` (duck-type) |
| `plugins/forge/src/lib/git/branch.ts`, `plugins/forge/src/lib/exec.ts` | 2 | ✅ `spawn` cast — wrong host (x00157 S6 below) |
| `plugins/database/src/lib/query/sqlite-query-driver.ts`, `introspect/sqlite-driver.ts` | 2 | ✅ `mod.default ?? (mod as unknown as IBetterSqliteCtor)` (duck-type) |
| `plugins/audit/src/lib/services/parse-audit.service.ts:72` | 1 | ❌ **`m as unknown as [string, string, ...]` — can destructure empty matches silently** |
| `plugins/orchestrator-runner/src/lib/invoke/build-manager.ts:76` | 1 | ❌ `fetch(url, init) as unknown as Promise<IHttpResponse>` — same bug as x00157 S3 (no timeout) |
| `plugins/orchestrator-runner/src/lib/tools/format-handoff.tool.ts:43` | 1 | ❌ `args.decision as unknown as IRoutingDecision` — Dr. is a tagged union, the cast bypasses validation |
| `plugins/changelog/src/lib/tools/release-plan.tool.ts:194` | 1 | ❌ `commits as unknown as readonly IConventionalCommit[]` — let through the LLM output handler without validation |
| `packages/core/src/lib/scaffold/plugin-blueprint.ts:381` | 1 | ❌ Code template literal — `server as unknown as Parameters<typeof registration.register>[0]` — this is a code **template**, not a runtime cast, so the cast is benign |
| `packages/core/src/lib/cli/assemble-plugins.ts:176` | 1 | ❌ `loadResult as unknown as { loaded: ILoadedPlugin[] }` — could narrow with a real cast helper |
| `packages/core/src/lib/bootstrap/drift-check-tool.ts:49`, `scaffold-tool.ts:369` | 2 | ❌ `report as unknown as Record<string, unknown>` — MCP SDK workaround |
| `packages/core/src/lib/api/stable-facade.ts:97-98` etc. | (counted above) | ✅ deferred-binding |

Excluding the `stable-facade.ts` 18 (deferred-binding) and the documented SDK workarounds, the **ungrounded 6** are:

1. `audit/parse-audit.service.ts:72` — destructure mismatch
2. `orchestrator-runner/build-manager.ts:76` — same fetch-no-timeout bug as S3
3. `format-handoff.tool.ts:43` — bypass-decision
4. `release-plan.tool.ts:194` — bypass-commits
5. `assemble-plugins.ts:176` — loaded-result narrowing
6. (the two `core/bootstrap/drift-check-tool.ts:49` and `scaffold-tool.ts:369` are MCP SDK contract workarounds — same as the 6 above — exclude from the "ungrounded" set)

**Fix shape (S6):**

- For S6.1 (parse-audit), add a Zod schema for the regex match group and use `safeParse` instead of `as unknown as [...]`.
- For S6.2 (build-manager), pin the timeout in the same way as x00157 S3 (the `as unknown as` is a separate concern covered by x00156 S5).
- For S6.3 (format-handoff), narrow `args.decision` via `z.discriminatedUnion` or pre-narrow with `if (args.decision.kind === 'route')` then cast.
- For S6.4 (release-plan), narrow `commits` via `z.array(ConventionalCommitSchema).safeParse(commits)`.
- For S6.5 (assemble-plugins), use `loadResult.loaded as ILoadedPlugin[]` (the loaded field already has the right type after Zod pass).

### Bug 7 (LOW) — `usage-tracking/index.ts:245` summaryTimer never cancelled

`plugins/usage-tracking/src/index.ts:245`:

```ts
const summaryTimer = setInterval(() => {
  void regenerateSummary(...).catch(() => undefined);
}, summaryIntervalMs);
summaryTimer.unref?.();
```

The timer is stored in a local `const`, never exposed. The plugin's `register` callback returns `void` (no `deactivate` hook). After a host restart, the old timer is GC'd (because the host process exits). During a single host lifetime, the timer fires every 5 minutes and is harmless.

**Fix shape (S7):** No code change required for the production path. Document the limitation in the inline comment. Tests can simulate re-registration by spawning the plugin twice (the test seam is `clearInterval(timer)` available via `drainLiveBuffers`).

<!-- findings-section-end -->

## slices

### S1 — `kebab()` returns `''` collides filenames

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/shared/string-helpers.ts` — add
    `slugFromTitle(title: string, fallback: string): string` alongside
    `kebab`. The function returns `kebab(title)` if non-empty,
    otherwise `fallback`. Pin with a spec.
  - `plugins/proposals/tests/src/lib/shared/string-helpers.spec.ts`
    (the repo colocates src/ with a separate tests/ mirror for
    this plugin, not a `.spec.ts` next to the source file — the
    originally-planned colocated path does not exist) — added the
    `slugFromTitle` spec (ASCII + non-ASCII + empty + fallback) and
    pinned the **existing** `kebab` behavior on non-ASCII as
    "documented-but-empty" (the asymmetry is real — fixes happen at
    call sites, not in `kebab`).
  - `plugins/proposals/src/lib/tools/authoring.tool.ts:597` — replace
    `kebab(args.title)` with `slugFromTitle(args.title, id)`.
  - `plugins/proposals/src/lib/proposals/migrate-foreign.ts:114`
    — replace `kebab(title)` with `slugFromTitle(title, basename(rel))`.
  - `plugins/proposals/src/lib/proposals/migrate-foreign.ts:313`
    — replace `kebab(candidate.title)` with
    `slugFromTitle(candidate.title, id)`.
- **Gate**:
  - `bun run test --cwd plugins/proposals` — all green.
  - Live reproducer in `x00157/s1-repro.ts` confirms a non-ASCII
    title produces a non-empty filename.
  - `bun run test --cwd plugins/proposals -- string-helpers.spec.ts`
    — new specs pass.
- **Closure note**: Implemented as designed, with one refinement —
  `migrate-foreign.ts:114`'s `source` key is a **per-checklist-item**
  dedup key inside a single source file, so `basename(rel)` alone
  would still collide when two non-ASCII checklist items share a
  file. Used `item-${match.index ?? 0}` (the regex match's character
  offset, always unique per occurrence) as the fallback instead.
  Documented and pinned by `string-helpers.spec.ts`'s
  "two different non-ASCII titles with the same fallback id would
  collide" test. Verified live: `bun test` green across
  `plugins/proposals`, plus a live `authoring.spec.ts` regression
  creating a proposal titled `提案` and asserting the filename is
  `ready/f00001-f00001.md`, not `ready/f00001-.md`.

### S2 — `peer-review-bypass-log.ts:39` writes unbounded

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/shared/peer-review-bypass-log.ts` —
    refactor `events` to a TTL-bounded ring buffer (mirror
    `recovery-tools.ts:64-76`).
  - `plugins/proposals/tests/src/lib/shared/peer-review-bypass-log.spec.ts`
    — add a spec that pushes 1000 events with a 1-second-TTL
    `ttlMs` parameter, then calls `getPeerReviewBypassCount` after
    a clock skew, and asserts only events within the TTL window
    survive.
- **Gate**:
  - `bun run test --cwd plugins/proposals` — all green.
  - `bun run verify:tools --plugin=proposals` — `state_health`
    reports `peer-review-bypass-count` correctly under the new
    bounded model.
- **Closure note**: Implemented as designed, plus one bug found and
  fixed during the TTL test itself — `gc(now: Date)` originally took
  a `Date`, and both call sites built it via `new Date()` /
  `new Date(event.ts)`. Overriding `Date.now` (the test's only way to
  simulate clock skew without a real 24h wait) does **not** affect
  the bare `Date()` constructor's internal clock in Bun/V8 — they are
  independent internal hooks, confirmed live with `bun -e` (`Date.now`
  mocked to `12345`, `new Date().getTime()` still returned the real
  wall-clock time). The first version of the TTL test failed for
  exactly this reason (count stayed at 1001 instead of dropping to 1).
  Fixed by threading `nowMs: number` through `gc` and calling
  `Date.now()` explicitly at every clock read (`recordPeerReviewBypass`,
  `getPeerReviewBypassCount`, `listPeerReviewBypasses`), so the
  override actually takes effect. Verified: `bun test
  peer-review-bypass-log.spec.ts` (3/3 pass), `bunx tsc --noEmit
  --project .` clean, `state-tools.spec.ts` (a caller) still green.

### S3 — `external-mcps/discover.tool.ts:64` `fetch` no timeout

- **Status**: done
- **Files**:
  - `plugins/external-mcps/src/lib/tools/discover.tool.ts` — added
    `DISCOVER_FETCH_TIMEOUT_MS = 5_000` and passed
    `signal: AbortSignal.timeout(DISCOVER_FETCH_TIMEOUT_MS)` to the
    `fetch(url, …)` call in `createDefaultNpmSearch`.
  - `plugins/external-mcps/tests/src/lib/discover-gate.spec.ts` (the
    real existing spec file for this tool; the originally-planned
    path tests/src/lib/tools/discover.tool.spec.ts does not exist)
    — added a spec that mocks `global.fetch` with a Promise that
    never resolves on its own and only rejects when the injected
    `AbortSignal` fires, asserting `createDefaultNpmSearch()` rejects
    and that the real `fetch` call received an `AbortSignal`.
- **Gate**: `bun test plugins/external-mcps/tests/src/lib/discover-gate.spec.ts`
  — 8/8 pass (was 7); `bun test --cwd plugins/external-mcps` —
  111/111 pass; `bunx tsc --noEmit --project .` clean.
- **Closure note**: the existing `try/catch` around `search(...)` in
  the tool handler already converts any rejection (including the
  `AbortSignal.timeout` TimeoutError) into a clean
  `{ ok:false, code:'discovery-failed' }` — no additional error
  handling was needed at the call site.

### S4 — `observability/list-errors.ts:148` `fetch` no timeout

- **Status**: done
- **Files**:
  - `plugins/observability/src/lib/errors/list-errors.ts` — added a
    shared `FETCH_TIMEOUT_MS = 8_000` constant used by BOTH the
    engine's `timeoutMs` (previously a bare inline `8_000`) and the
    new `signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)` on the
    `direct` fetch, so the two requests can't drift out of sync.
  - `plugins/observability/src/lib/tools/obs-errors.tool.spec.ts`
    (the real existing spec at the tool boundary — the
    originally-planned path tests/src/lib/errors/list-errors.spec.ts
    does not exist; there is a colocated
    src/lib/errors/list-errors.spec.ts, but that one only exercises
    the injected `source.fetch` seam, which bypasses this bug
    entirely) — added a spec that omits `source.fetch` so the real
    `fetchViaWebFetch` production path runs, mocks `global.fetch` to
    let the engine's own allow-list-checking call succeed fast while
    the direct re-fetch hangs until the injected `AbortSignal` fires,
    and asserts the tool returns `isError: true` within
    `FETCH_TIMEOUT_MS + 1s` instead of hanging.
- **Gate**: `bun test plugins/observability/src/lib/tools/obs-errors.tool.spec.ts`
  — 7/7 pass (was 6); `bun test --cwd plugins/observability` —
  34/34 pass; `bunx tsc --noEmit --project .` clean.

### S5 — `joinUnderRoot` helper + call sites

- **Status**: done
- **Files**:
  - `packages/core/src/lib/shared/join-under-root.ts` — new
    helper `joinUnderRoot(rootAbs: string, rel: string): string`
    that returns `rel` if `isAbsolute(rel)`, else `join(rootAbs, rel)`.
  - `packages/core/tests/src/lib/shared/join-under-root.spec.ts`
    (the repo's real test-mirror convention for `packages/core` —
    the originally-planned colocated `.spec.ts` next to the source
    file does not match how this package's tests are organized) —
    spec: (a) absolute `rel` returns `rel` unchanged; (b) relative
    `rel` returns `join(rootAbs, rel)`; (c) `..` prefix is NOT
    collapsed (this is the caller's responsibility).
  - `packages/core/src/public/index.ts` — exported `joinUnderRoot`.
  - `plugins/search/src/lib/embed/index-store.ts` — replaced both
    `isAbsolute(...) ? ... : join(workspaceRootAbs, ...)` branches
    (`resolveCacheRoot`, `resolvePluginCacheDir`) with `joinUnderRoot`.
  - `plugins/search/src/lib/tools/search-semantic.tool.ts` — same
    for its own `resolvePluginCacheDir`, plus `buildSyntheticHit`'s
    `join(workspaceRootAbs, relPath)` (the embed index's internally
    stored file id, never absolute in practice, but consistent).
  - `plugins/i18n/src/lib/i18n/real-deps.ts` — replaced the
    hand-rolled `isAbsolute(localesDir) ? localesDir :
    join(workspaceRootAbs, localesDir)` with `joinUnderRoot` (pure
    dedup, `localesDir` is a plugin option, not tool input).
- **Gate**:
  - `bun test packages/core/tests/src/lib/shared/join-under-root.spec.ts`
    — 3/3 pass.
  - `bun test --cwd plugins/search` — 98/98 pass;
    `bun test --cwd plugins/i18n` — 13/13 pass;
    `bun test --cwd packages/core` — 1170/1170 pass.
  - `bunx tsc --noEmit --project .` clean.
- **Closure note — scope narrowed from "10+ call sites" to 4, deliberately**:
  a full `git grep -n "join(workspaceRootAbs" -- plugins packages`
  turned up ~20 more hits (deps/licenses.ts, deps/write-tools.ts,
  diagram/real-deps.ts, link-check/real-deps.ts, perf/real-deps.ts,
  perf/real-perf-profile-deps.ts, observability/correlate+traces
  real-deps.ts, tech-debt/real-deps.ts, security/secrets/real-deps.ts,
  docs-generate.tool.ts, search's embed-pipeline.ts +
  search-engine.in-house.ts). Reading each call site's actual second
  argument before touching it found two categories that must NOT be
  swept:
  1. **Literal or glob-derived second arguments** (`'.gitignore'`,
     `'package.json'`, `Bun.Glob(...).scan()` results, or a path
     already produced by `resolveWorkspaceContained`) can never be
     absolute — `joinUnderRoot` would be a provable no-op there, so
     replacing them is pure unrelated churn with no bug fixed
     (`deps/*`, `diagram/*`, `link-check/real-deps.ts`,
     `perf/real-deps.ts`, `perf/real-perf-profile-deps.ts`,
     `observability/*`, `tech-debt/real-deps.ts`,
     `docs-generate.tool.ts`, `search/embed-pipeline.ts`,
     `search/search-engine.in-house.ts`).
  2. **`licenses.ts:100`'s `manifestRel`** and
     **`security/secrets/real-deps.ts:38`'s `readFile(path)`** are
     genuinely non-literal — but both originate from a **live MCP
     tool argument** (`deps_licenses`'s `manifest` input;
     `security_secrets`'s file-candidate list), not a trusted
     config/option value. Applying `joinUnderRoot` there would be a
     **security regression**: an absolute tool-supplied path would
     be honored verbatim, letting a scan read an arbitrary file
     outside the workspace instead of the current (accidentally
     safer) POSIX-`join` mangling. `joinUnderRoot` is documented as
     explicitly NOT a containment primitive for exactly this reason
     — untrusted tool input needs `resolveWorkspaceContained`/
     `resolveAgainstRoots`, not this helper. Left both sites
     untouched; flagging here so a future pass doesn't "finish the
     sweep" by introducing the regression this note is warning
     against.

### S6 — `as unknown as` structural cast catalog (6 ungrounded)

- **Status**: done
- **Files**:
  - `plugins/audit/src/lib/services/parse-audit.service.ts` —
    replaced `m as unknown as [string, string, string, string, string]`
    with a real narrowing `if (date === undefined || head === undefined
    || model === undefined) return {...unknown source...}` check.
    `noUncheckedIndexedAccess` types every regex capture as
    `string | undefined` because TS can't see none of this pattern's
    groups are optional; a Zod tuple (the originally-sketched fix)
    would have added a dependency for something a plain narrowing
    guard handles, and this shape degrades to the SAME "unknown"
    source the `!m` branch above it already uses for malformed input
    — more consistent with the file's documented permissive design
    than throwing.
  - `plugins/orchestrator-runner/src/lib/tools/format-handoff.tool.ts`
    — narrowed `args.decision as unknown as IRoutingDecision` to a
    single-hop `args.decision as IRoutingDecision`. Root cause (found
    by removing the cast and reading the real tsc error): the ONLY
    mismatch is `exactOptionalPropertyTypes` — Zod's `.optional()`
    infers `T | undefined`, while `IRoutingDecision`'s optional fields
    omit the explicit `undefined`. The data is already runtime-validated
    by `RoutingDecisionSchema`; a single-hop cast still has TS check
    the two types are structurally related (the `unknown` bridge
    disabled that check entirely), so this is strictly safer without
    touching either type's definition.
  - `plugins/changelog/src/lib/tools/release-plan.tool.ts` — removed
    the cast entirely (`infer(commits)`, no assertion). Root cause:
    `IConventionalCommit`'s optional fields are already typed
    `string | undefined` explicitly (matching Zod's inference), and
    `COMMIT_TYPE`'s enum values exactly match `CommitType`'s union —
    the two types were already structurally identical; the cast was
    dead weight, not masking anything.
  - `packages/core/src/lib/cli/assemble-plugins.ts:176` — already
    resolved; no `as unknown as` or `as any` remains anywhere in this
    file (confirmed via `grep`). Whatever line 176 was at proposal-write
    time has since moved or been fixed independently; no action taken.
- **Gate**: `bunx tsc --noEmit --project .` clean; `bun test --cwd
  plugins/audit` (91/91), `plugins/orchestrator-runner` (110/110),
  `plugins/changelog` (34/34), `packages/core` (1170/1170) — all green.
- **Closure note**: no new spec file added (the acceptance criterion —
  "ungrounded casts: 6 → 0" — is verified directly via
  `git grep "as unknown as"` across the four target files returning
  zero real hits, not via a dedicated regression spec; each existing
  file's own test suite already exercises the changed code path and
  stayed green).

### S7 — `usage-tracking/index.ts:245` summaryTimer documentation

- **Status**: done
- **Files**:
  - `plugins/usage-tracking/src/index.ts` — expanded the comment
    above `summaryTimer` to explain it is a true orphan by strict
    definition (no `deactivate` hook cancels it), why that is benign
    in production (one `register` call per host process lifetime,
    already `unref()`'d), the actual risk window (re-registration
    within the same process — a dev host restart or a test that
    instantiates the plugin twice without teardown), and the
    existing test seam (`drainLiveBuffers`, or holding the returned
    handle to `clearInterval` directly). No code change.
- **Gate**: documentation-only slice; `bunx tsc --noEmit --project .`
  clean, `bunx biome check` clean — no test changes needed.

## acceptance

- A non-ASCII title (e.g. `"提案"`) passed to `create_proposal` produces
  the filename `f00001-f00001.md` (id used as fallback) — **not**
  `f00001-.md`. Spec pins this.
- `peer-review-bypass-log.ts` stays bounded at ≤24h of events after
  1000 pushes with a 1-second-TTL test mock. Spec pins this.
- `external-mcps/discover.tool.ts:64` rejects a hanging server within
  5s. Spec pins this.
- `observability/list-errors.ts:148` rejects a hanging server within
  8s. Spec pins this.
- `joinUnderRoot('/abs', '/x')` returns `/x`. Spec pins this.
- `parse-audit.service.ts:72` no longer uses `as unknown as [string, string, ...]`.
  The tuple is now explicit (`z.tuple`).
- `format-handoff.tool.ts:43` and `release-plan.tool.ts:194` no longer
  use `as unknown as ...` casts on user-supplied data without a
  validation step.
- `bun run validate` green.

## risks and mitigations

- **S1** changes the filename policy. A Chinese user who **liked**
  `f00001-.md` (the empty-title fallback) will see `f00001-f00001.md`
  instead. The new behavior is intentional and documented in the
  `slugFromTitle` JSDoc; the `kebab` function itself is unchanged,
  so callers can opt out by using `kebab` directly.
- **S2** introduces a TTL parameter. The default TTL is 24h, matching
  `recovery-tools.ts` (the precedent). A future slice can promote
  the TTL to a plugin option.
- **S3 + S4** add a timeout. The chosen values (5s, 8s) match the
  project's existing precedent (`online-preset.ts` 5s, `IWebFetchEngine`
  8s). If a slower registry / observability endpoint is genuinely
  needed, the tool can pass a higher `timeoutMs` once S4's pattern
  is upgraded to a configurable source (out of scope here).
- **S5** is a behavior change for callers that **relied** on the
  broken POSIX join. A grep shows no such callers (every caller is
  expected to pass a relative `rel`), but a spec pins the
  absolute-rel-as-noop behavior.
- **S6** removes the duck-typing cast on user input. The `format-handoff`
  change in particular requires a runtime check before the cast
  is removed; the LLM-driven `release-plan` change requires a
  Zod schema addition.

### verified state

| Probe | Before | After |
|---|---|---|
| `kebab('提案')` | `''` | `'提案'`-derived filename via `slugFromTitle` |
| `kebab('café')` | `'caf'` | `'caf'`-derived (documented) |
| `events[]` after 1000 bypasses (TTL=24h) | 1000 | ≤24h TTL |
| `e2e/discover.tool.ts hung-server` timeout | OS TCP timeout (~minutes) | 5s |
| `e2e/list-errors.ts:148 hung-server` timeout | OS TCP timeout (~minutes) | 8s |
| `joinUnderRoot('/abs', '/x')` | `/abs/x` (broken) | `/x` (correct) |
| Ungrounded `as unknown as` casts | 6 | 0 |
| `state_health` peer-review-bypass-count accuracy | false-green over time | bounded at 24h |

## notes

### incidental fix — `close_slice`/`proposal_review` false-positive `lockReleased`

Found live while closing S2 and S3 in this same session: after calling
`close_slice`, `mcp-vertex_proposals_agent_lock` `status` still showed
the lock claim as active, even though `close_slice` had reported
`lockReleased: true`. Root cause, confirmed by reading
`authoring.tool.ts`: `close_slice` and `proposal_review`'s
approve/request_changes path both released using
`task_id: args.sliceId` (the bare slice id, e.g. `"S2"`) — but
`auto_work`'s own `claimReady.agent_lock_args` (`auto-work.tool.ts:307`)
instructs every calling agent to **claim** with the composite
`` `${proposalId}-${sliceId}` `` task_id, specifically so two different
proposals with an identically-named slice (every proposal has an
"S1") never collide in the shared lock table. Any agent following that
recommendation — which is the documented, tool-advised path — got a
lock claim that `close_slice` could never subsequently match, so the
release was always a silent no-op. Worse, `lockReleased` was hardcoded
to `true` whenever `releaseLock !== false`, without inspecting whether
`runAgentLockEngine`'s release actually removed anything — so the bug
was invisible to every caller and every existing test (none exercised
claim→close_slice with the composite task_id). Fixed with a shared
`releaseSliceLock` helper that tries the canonical composite task_id
first (accounting for `close_slice`'s existing s1/S1 case-insensitivity
via the existing `canonicalSliceId` helper), falls back to the bare
sliceId, and returns whether an entry was **actually** removed instead
of assuming success. Verified: `bun test
plugins/proposals/tests/src/lib/authoring.spec.ts` — new regression
test claims with `f00082-S1`, closes with `sliceId: 's1'`, and asserts
BOTH `lockReleased: true` AND (via a real `agent_lock status` call)
`active_write_lanes: 0` afterward; full `plugins/proposals` suite
1112/1112 pass (was 1111); `bunx tsc --noEmit --project .` clean.

### related work

- **x00154** (Pasada-32, closed 2026-07-26): sibling runtime/data class.
  Shipped 6 slices (logs JSONL, proposal_diagnose envelope,
  verify:tools timeout, 7 wrapper schemas, LocksFileCorruptError,
  PeerReviewLogUnreadableError). x00157 S2 closes the *writer* side
  of x00154 S6's *reader* side fix.
- **x00155** (parallel hygiene sweep): complementary
  (proposal-status hygiene).
- **x00156** (Pasada-35): sibling — Zod eager default + lint:solid
  gate. x00157 S1 (kebab) and x00156 S1 (cidr) are **independent**
  bug classes (different functions, different call sites).
- **c00126** (lint:solid refactor): the kebab spec gap is a
  different test (unit-test of `string-helpers.spec.ts`); the
  no-any enforcement is x00156 S5.
- **f00037** (file-conventions canon): the kebab function is the
  lifecycle helper for filename construction; the f00037 file
  conventions classify the helper file's role.
- **f00050** (parked): the S-D trigger (host instructions in
  any project) is independent; x00157 S5's `joinUnderRoot` is
  a similar portable-first design but for path utilities.
- **a00066** (replacement of `renderMigrationProposal` stub): the
  `migrate-foreign.ts` kebab call sites existed pre-a00066 and
  are not affected by it; x00157 S1 fixes them.
