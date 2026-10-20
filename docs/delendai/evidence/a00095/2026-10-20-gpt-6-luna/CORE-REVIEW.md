# Core review — independent phase A

Auditor: `gpt-6-luna`  
Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`  
Status: in progress; this is not a complete core review or a final audit.

## Coverage checkpoint

| Area | Inventory | Review status | Notes |
|---|---:|---|---|
| `packages/core/src/lib` | 977 TypeScript files in 66 immediate feature directories | In progress | Inventory read from Git tree. Began with filesystem/persistence, mutation idempotency, plugin discovery, and shell-status paths. Remaining core files/directories are not yet assessed. |
| Core specs | Inventory found 200+ spec files; exact exhaustive classification pending | In progress | Read idempotency and file-artifact-store specs. Neither covers same-key concurrent operations. |
| `packages/state` | Source and tests partially reviewed | In progress | Memo derivation, artifact store interface, fingerprint, producer and parts of the in-memory driver reviewed; remaining driver/contracts/specs pending. |
| `packages/context-compiler` | Main source paths reviewed | In progress | Ref parsing/expansion and compiler entry points reviewed; broader tests and boundary review pending. |
| Other packages/plugins/extensions/apps/tools | Not inventoried in this phase | Pending | Continue in playbook order after core. |

## Additional confirmed finding

### LUNA-CORE-005 — Dot-dot segments widen a WIP claim and checkpoint another unit's changes

- **Severity:** P2
- **Status:** confirmed by end-to-end reproduction on the assigned snapshot
- **Component:** `packages/core` WIP scope validation and checkpoint engine
- **Locations:** `packages/core/src/lib/wip-engine/scope.ts:42–63,133–147,156–176,180–205`; `packages/core/src/lib/wip-engine/checkpoint.ts:163–177,225–232`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** a scope declaration containing a `..` path segment should be rejected before expansion or staging, so the checkpoint contains only paths within the declared subtree.
- **Actual:** validation rejects `..` only when it is the whole path, begins the path, or is preceded by `/` and followed by another segment. It accepts a trailing segment such as `packages/core/..`. `worktreeFiles()` then traverses the resolved parent directory while returning syntactically unnormalized paths containing `..`. Git later normalizes those path arguments and stages changes elsewhere in that parent directory.
- **Source excerpt:**

  ```ts
  path === '..' || path.startsWith('../') || path.includes('/../')
  ```

  `packages/core/..` has no `/../` substring because the `..` is at the end. `lstat(join(root, path))` resolves it to `packages`, and the recursive walk emits its children.
- **Reproduction:** `validateScopePaths(['packages/core/..'])` returned it as valid. `expandScope()` returned 2,435 paths in the snapshot, including `packages/core/../peer/...` and normalized duplicates. In a throwaway real Git repository, a checkpoint requested only `packages/core/..` while two files under `packages/core/` and sibling `packages/peer.txt` were modified. The operation returned `created`; its commit contained both `packages/core/a.txt` and `packages/peer.txt`. The unrelated peer modification was therefore captured in the WIP ref. The throwaway repo was removed after the reproduction.
- **Impact:** a malformed or adversarial claim can cross a work-unit boundary and durably checkpoint another unit's dirty changes. The `work checkpoint` preflight collision check does not catch this form either: `scope-collision.service.ts:30–32` compares raw prefixes, and `collisionsWith({ scope: ['packages/core/..'], units: [{ paths: ['packages/peer.txt'], ... }] })` returned no collision. This violates the engine's exact-scope isolation guarantee. It does not require a filesystem escape outside the repository.
- **Root cause:** validation checks selected textual patterns instead of rejecting every `..` path component or resolving and checking the canonical path before traversal. `expandScope()` also trusts its input without normalizing each resulting path before staging.
- **Recommended fix:** reject any path component exactly equal to `..` after slash normalization, and canonicalize/contain paths before filesystem traversal. Before `update-index`, require every expanded path to be repository-relative, normalized, and within a validated claim. Add regression coverage for `dir/..`, `dir/../sibling`, repeated separators, and equivalent backslash input.
- **Regression proof:** in a real temporary Git repo, modify one file in the claimed directory and one in its parent/sibling, request the traversal scope, and assert validation refuses it and no WIP ref is created. Also test `expandScope()` cannot emit a path containing a `.` or `..` component.
- **Confidence:** high; both validator behavior and foreign-file capture were reproduced through the actual checkpoint engine and Git plumbing.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

## Confirmed finding

### LUNA-CORE-001 — Concurrent writes to one artifact key reuse the same temporary file

- **Severity:** P2
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/core` file-backed artifact store
- **Location:** `packages/core/src/lib/context-store/file-artifact-store.ts:59–73`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** concurrent `put()` calls for the same artifact key should complete without losing store availability; atomic replacement should use per-operation temporary paths and serialize the read-modify-write when metadata depends on the prior record.
- **Actual:** every write for a key in one process derives the temporary path as `${path}.${process.pid}.tmp` (line 71). Concurrent writes open/truncate that same temp file and race to rename it. A writer can fail with `ENOENT` after another writer has moved the shared temp path.
- **Source excerpt:**

  ```ts
  const temporary = `${path}.${String(process.pid)}.tmp`;
  await writeFile(temporary, JSON.stringify(record));
  await rename(temporary, path);
  ```

- **Reproduction:** from the snapshot checkout, 40 simultaneous `store.put(key, { i })` calls against a fresh temporary root gave `5` fulfilled and `35` rejected. A higher-level reproduction created a real `createMemoDerivationEngine({ store })`, registered one derivation, and ran 30 concurrent `apply()` calls with one fingerprint: `30` derives ran, only `7` calls fulfilled, `23` rejected with `ENOENT`.
- **Evidence:** source lines 59–73 derive one PID-scoped temporary path for every operation; the first reproduction returned `{"ok":5,"failed":35,"final":{"i":39},"temps":[]}`. The second traced the same key through `packages/state/src/lib/memo-derivation-engine.service.ts:52–76` and returned `{"deriveCalls":30,"fulfilled":7,"rejected":23,"reason":"ENOENT"}`. Existing `packages/core/tests/src/lib/context-store/file-artifact-store.spec.ts` tests sequential puts and compiler integration, but not simultaneous puts.
- **Impact:** concurrent callers sharing one derivation fingerprint can fail to persist a result. The file may still contain a valid last writer's record, but individual callers reject rather than receive it.
- **Root cause:** atomic rename protects readers from partial contents, but the temporary name is not unique per write and the `put()` read-modify-write sequence has no per-key serialization. The current memo engine also allows concurrent misses; see `LUNA-CORE-003`.
- **Recommended fix:** use a unique temporary file per operation (exclusive creation) and serialize `put()` per resolved key across the read/createdAt calculation and rename; clean up a temp file on failure. Decide whether cross-process writers must also be serialized and test that contract explicitly.
- **Regression proof:** a test with many concurrent same-key puts should assert all calls settle successfully, the stored JSON parses and matches a successful write, and no temp files remain. Add a separate concurrent first-write check for `createdAt` semantics.
- **Confidence:** high; the reproduction is repeatable under the in-process concurrent workload and the collision is explicit in source.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-CORE-002 — Simultaneous idempotency calls execute the mutation more than once

- **Severity:** P3
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/core` mutation idempotency helper
- **Location:** `packages/core/src/lib/mutations/idempotency.ts:109–124`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** for a given key, calls made while the first operation is still running should share its in-flight result, consistent with the module comment that retries should not duplicate side effects.
- **Actual:** each invocation checks only the completed `records` map, then awaits `fn()` before inserting its result. A second call in that interval sees no entry and also invokes `fn()`.
- **Source excerpt:**

  ```ts
  const hit = records.get(key);
  if (hit !== undefined && !isExpired(hit, at)) return hit.value;
  const value = await fn();
  records.set(key, { key, value, storedAt: at, expiresAt: at + ttlMs });
  ```

- **Reproduction:** two concurrent calls to `withIdempotency('same', fn)` with `fn` held behind a shared promise returned `{"calls":2,"results":["side-effect","side-effect"]}`.
- **Evidence:** `withIdempotency` source lines 109–124; existing `packages/core/tests/src/lib/mutations/idempotency.spec.ts` covers sequential repeats and failures but does not test simultaneous calls. `rg` found no production call sites beyond the helper itself in the snapshot; package exports do not expose this internal module as a public subpath.
- **Impact:** if the helper is used for overlapping retries, the mutation runs twice. Current impact is limited because the snapshot contains no production caller and the helper is not on the package's public export surface.
- **Root cause:** only completed results are stored; there is no per-key in-flight promise or lock.
- **Recommended fix:** either keep a per-key in-flight promise and remove it on rejection/expiry, or narrow the documented contract to sequential retries and avoid presenting it as a concurrent idempotency guard. Do not add cross-process guarantees unless storage is also shared and synchronized.
- **Regression proof:** invoke two calls concurrently behind a deferred promise and assert one `fn` execution, equal results, and no stale in-flight entry after rejection.
- **Confidence:** high on the code behavior; low current exposure because no production caller or public export exists in this snapshot.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

## Areas inspected with no finding so far

- `packages/core/src/lib/bootstrap/analyze-project.ts` keeps project reads behind the injected `IFileReader`; its script, framework, CI, package-manager, MCP and agent-config detectors are adapters over rule modules. `bootstrap-tool.ts` composes the four registrations and shares one analysis promise. This is a focused source read; the detector rules and their specs remain pending.
- `packages/core/src/lib/plugins/discovery.ts` coalesces concurrent scans and sorts ids; workspace listing and cache-token helpers expose explicit `rootDir` options. `manifest/discovery.ts` also accepts a root argument; all production tooling call sites found pass it. Both modules still default omitted roots to `process.cwd()` (`discovery.ts:149,177`, `manifest/discovery.ts:23,47`), so determine whether these public helpers count as engines under the host rule before closing this area. No issue is asserted yet.
- `packages/core/src/lib/scaffold/scaffold-host.ts` uses a caller-provided model default (or `<your-model>`) and only emits a concrete Claude model when it matches a configured alias or `claude-` id. Its generated `startServer()` is explicitly the generated host's launch entry point and receives the workspace root from the host configuration; the generated fallback to `process.cwd()` is documented as the one permitted entry-point read. More scaffold generation paths remain to review.
- `packages/core/src/lib/project/create-mcp-project.ts` forwards optional tool `outputSchema` to the MCP registration and exposes schema-bearing tool bindings; this pass did not establish a missing-schema defect. The full composition and registration surface remains pending.
- `packages/core/src/lib/tools/overview-tool.ts` declares the compact output schema and applies the visible-tool filter before returning the grouped or full view. `shell-status.tool.ts` also declares its output schema. Its `process.cwd()` value is passed to `InstallSuggestionsService`, whose current `workspaceRoot` field is stored but not read; this path produced no observable workspace effect in the inspected implementation, so it is not recorded as a finding.
- The work-unit checkpoint path validates raw scope before calling the WIP engine and checks claimed paths against other units. That collision preflight uses segment-prefix comparisons on unnormalized strings (`scope-collision.service.ts:24–44`), which also misses the `packages/core/..` traversal case now documented in `LUNA-CORE-005`. `unit-lease.store.ts`, `unit-lease.service.ts`, `unit-fence.service.ts`, and `worktree-agent.service.ts` were read for lock, lease, superseding-generation and worktree-owner handling; no separate defect is confirmed in this pass. Worktree-agent stamping uses synchronous file I/O and remaining call-path/hot-path classification is still open.
- `unit-lease.store.ts` protects lease read-modify-write with `withFileMutex` and uses the shared atomic writer. Lease removal is intentionally performed after ref removal and is not mutex-wrapped; inspect its concurrent callers before treating that as a defect. `unit-fence.service.ts` ignores same/lower generations and checks the work and publication namespaces; broader ref-shape and remote-ref tests remain pending.
- `work-ref-moves.service.ts` records journal entries with append and prunes via a PID-named temporary file when the journal exceeds 512 KiB (`:103–145`). The writer catches failures by design; concurrent prune behavior and the caller's reliance on loop diagnostics are still open, so no finding is asserted yet.
- `createLazyPluginDiscovery` shares an in-flight scan and caches sorted plugin IDs/manifests. The reviewed code did not show a defect in the core cache path; this is a preliminary note, not full plugin-discovery signoff.
- `createShellStatusSnapshot` and its tool registration expose an `outputSchema`; a complete execution/security review of its process invocations remains pending.
- `writeFileAtomic`, lexical/realpath containment helpers, `fsRead`, and `safeRename` were traced at source level. The reviewed primitives use exclusive same-directory temporaries, sync file data before rename, reject lexical escapes, and add realpath checks for existing reads. This is a preliminary no-finding note; caller-level containment/TOCTOU review remains open.
- `withFileMutex` acquisition, stale-lease reclamation, heartbeat and release paths were read. Its `fail` default avoids stealing live holders; stale reclamation checks owner identity and revalidates the lease. Call-site key aliasing and caller-level lock discipline remain to be checked.

## Additional confirmed finding

### LUNA-CORE-003 — Memo derivations are recomputed for concurrent identical fingerprints

- **Severity:** P3
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/state` memo derivation engine
- **Location:** `packages/state/src/lib/memo-derivation-engine.service.ts:47–76`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** an engine documented as deriving once per fingerprint should coalesce concurrent misses for the same key, then memoize the shared record.
- **Actual:** each call independently checks the in-memory map and store, then invokes `derivation.derive()` and `store.put()` without a per-key in-flight entry. Concurrent calls that all miss the same key all perform the derivation.
- **Source excerpt:**

  ```ts
  const remembered = memory.get(key.id) ?? (await input.store?.get<TOut>(key)) ?? undefined;
  if (remembered !== undefined) return remembered as IArtifactRecord<TOut>;
  const value = await derivation.derive(derivationInput);
  // ...
  const record = await input.store.put(key, value);
  ```

- **Reproduction:** 30 concurrent `apply('same', ...)` calls using the same fingerprint and a delayed derive callback invoked the callback 30 times. With the current file store, only 7 fulfilled and 23 were rejected with `ENOENT` as described in `LUNA-CORE-001`.
- **Evidence:** source lines 52–76; `createMemoDerivationEngine` docs claim it derives once per fingerprint; the inline Bun reproduction captured the derive callback count and settled results. Existing state tests need further review for coverage of concurrency.
- **Impact:** repeated expensive derivation work under load; when paired with the current file store, duplicate writes amplify its temp-path collision into failed calls.
- **Root cause:** no per-key in-flight promise is recorded around the cache-miss, derive and persistence sequence.
- **Recommended fix:** coalesce in-flight work by storage identity plus key; remove the pending entry after both success and failure. Define what happens if a derivation is re-registered during an in-flight apply.
- **Regression proof:** concurrent calls for the same key should invoke `derive` once and all receive a valid artifact record; distinct keys should still derive concurrently; rejection must clear the in-flight entry for retry.
- **Confidence:** high; callback count was measured directly and all calls shared the same computed key.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-CC-001 — Context artifact refs allow traversal through the file store's kind segment

- **Severity:** P2
- **Status:** confirmed by controlled reproduction on the assigned snapshot
- **Component:** `packages/context-compiler` ref parser and `packages/core` file artifact store
- **Locations:** `packages/context-compiler/src/lib/context-manifest.ts:116–129, 150–162`; `packages/context-compiler/src/lib/ref-expander.ts:13–19`; `packages/core/src/lib/context-store/file-artifact-store.ts:30–34, 76`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** parsing an artifact key from a context ref should validate each runtime field against the artifact-key contract, and the filesystem store should ensure its resolved path remains below its configured root.
- **Actual:** `parseArtifactKey()` accepts any string for `kind` and casts the JSON object directly to `IArtifactKey`. The file store inserts `key.kind` as a path segment in `join(..., key.kind, ...)`. A kind such as `../../escaped` therefore escapes the store root. `loadRecordFromRef()` passes the parsed value to `artifactStore.get()`, and the public ref expander reaches this path.
- **Source excerpt:**

  ```ts
  typeof value.kind !== 'string' ||
  // ...
  return value as IArtifactKey;
  ```

  ```ts
  const fileOf = (root: string, key: IArtifactKey): string =>
    join(scopeDir(root, key.scope), key.kind, `${sha256Hex(key.id)}.json`);
  ```

- **Reproduction:** on the snapshot, `parseArtifactKey()` accepted `{ scope: validScope, kind: '../../escaped', id: 'known-id' }`. A fixture was placed at the resolved escaped path (`<temp>/escaped/<sha256(known-id)>.json`), outside the configured store root. `loadRecordFromRef(createFileArtifactStore({ root }), { kind: 'artifact', id: JSON.stringify(key) })` read and returned that fixture. The fixture was removed after the check.
- **Impact:** a ref that can be supplied to the compiler can make the file-backed store read JSON from a path outside its root, subject to the store's hashed filename and valid-record JSON path layout. This establishes a store-boundary violation; it does not by itself prove unrestricted reads of arbitrary filenames or arbitrary write access through the compiler's ref-expansion API.
- **Root cause:** TypeScript casts are used as runtime validation, and `fileOf()` trusts a path-bearing key field without validating or containing the resolved path.
- **Recommended fix:** validate `kind` against the supported artifact-kind set and validate the shape of `scope` and `id`; independently resolve the file path and reject it unless it remains within the canonical store root. Treat persisted or incoming refs as untrusted at the boundary.
- **Regression proof:** reject traversal and separator-bearing kinds in `parseArtifactKey()`; test file-store `get()` with malformed runtime keys and assert no path outside the root is read; include platform-appropriate containment tests for both POSIX and Windows separators.
- **Confidence:** high on acceptance and root escape, reproduced with an outside-root fixture; medium on exploitability in deployments because caller control of `IContextRef` and filesystem layout determine practical reach.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-CORE-004 — In-memory derivation cache omits state scope from its key

- **Severity:** P2
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/state` scoped derivation cache
- **Location:** `packages/state/src/lib/memo-derivation-engine.service.ts:47–58`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** an artifact returned for a derivation should retain the storage scope of the call that requested it. Storage identity is distinct from the semantic fingerprint, but still distinguishes where a record belongs.
- **Actual:** the cache lookup is `memory.get(key.id)`, even though the artifact key also contains `scope`. Two scopes with the same derivation fingerprint collide in the same engine instance; the second caller receives the first caller's record, including its scope.
- **Source excerpt:**

  ```ts
  const key: IArtifactKey = {
    scope: derivationInput.inputs[0]?.key.scope ?? input.scope,
    kind: 'fingerprint',
    id: `${name}:${derivation.fingerprint(derivationInput)}`,
  };
  const remembered = memory.get(key.id) ?? (await input.store?.get<TOut>(key));
  ```

- **Reproduction:** call one engine twice with equal input content and the same fingerprint, but input records in scopes `/repo-A` and `/repo-B`. Both calls were valid and deterministic; the second result's `key.scope.locator.workspaceRoot` was `/repo-A`, not `/repo-B`.
- **Evidence:** source lines 47–58 and inline Bun output `{"firstScope":"/repo-A","secondRequested":"/repo-B","secondReturned":"/repo-A","value":{"copied":"same-content"}}`. The input values were identical across scopes; this establishes the identity collision without assuming a dishonest fingerprint. `packages/contracts/src/state.ts:69–82` defines project scopes by workspace and worktree. The state spec `packages/state/tests/src/lib/memo-derivation-engine.spec.ts` exercises sequential cache hits and restart persistence, not cross-scope reuse.
- **Impact:** a caller that routes, lists, or persists follow-on work by the returned record's scope can attribute a result to the wrong workspace. The code establishes an identity-isolation defect; a confidentiality leak is possible only if scope-dependent data is included without the fingerprint reflecting it, so no direct secret disclosure is claimed.
- **Root cause:** the in-memory cache is keyed by semantic ID alone while the artifact-store key is composite (`scope`, `kind`, `id`).
- **Recommended fix:** use the same canonical storage identity plus record ID for the memory key as the persistent store. Keep semantic fingerprinting separate as designed.
- **Regression proof:** use equal-content records in two distinct scopes with the same fingerprint in one engine; each result must preserve its own scope, and a persistent store should retrieve the matching scope entry.
- **Confidence:** high on wrong-scope return; medium on downstream impact because production callers of this engine are sparse in the snapshot.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-STATE-001 — Delimiter-based state keys alias distinct project scopes

- **Severity:** P2
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/state` in-memory registry scope indexing
- **Location:** `packages/state/src/lib/driver-in-memory.ts:1195–1212, 1000–1002, 1050–1052`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** structurally distinct `StateScope` values must map to distinct in-memory registry state; `scopesEqual()` defines equality by exact field equality.
- **Actual:** `scopeStateKey()` joins fields with an unescaped `|`. Project scopes `{ workspaceRoot: '/repo|wt', worktreeId: 'x', cacheRoot: '/cache', docsRoot: '/docs' }` and `{ workspaceRoot: '/repo', worktreeId: 'wt|x', cacheRoot: '/cache', docsRoot: '/docs' }` produce the same key. These are distinct under `scopesEqual()`, but `ensureScopeState()` and `scopeStateFor()` address the same `IScopeState`.
- **Reproduction:** on the snapshot, registered a producer whose projection records the requested workspace and worktree, hydrated each of the two scopes with a valid seed fingerprint, and then called `lookup()` for both. Both lookups returned generation `g000002-0002`, storage identity from the second scope, and projection `{ workspace: '/repo', wt: 'wt|x' }`. The first scope lost access to its own active generation.
- **Evidence:** source concatenation at `scopeStateKey()` does not escape or length-prefix fields; the two test scopes are unequal objects with identical concatenated representations; runtime output showed both lookups returning the second projection. `packages/state/src/lib/scope.ts:26–78` implements equality using exact fields, not this concatenation.
- **Impact:** when identity values contain delimiter characters, unrelated project or worktree-cache scopes can share generations, leases and claims in a registry instance. This can route state across workspaces. The branded worktree ID helper documents normalization but does not reject `|`; filesystem roots also permit this character on POSIX.
- **Root cause:** a hand-built delimiter serialization is used as a map key without escaping or an unambiguous encoding.
- **Recommended fix:** derive keys from canonical structured serialization (or length-prefixed fields) covering exactly the fields used by `scopesEqual()`; add collision regression cases for every scope kind.
- **Regression proof:** hydrate the two colliding scopes in one registry with distinct producer outputs; assert lookups, active generations, coordination and leases remain independent. Also test separator characters across all string identity fields.
- **Confidence:** high; collision and cross-scope lookup behavior were directly reproduced.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-STATE-002 — `fingerprintFromResolved()` drops producers with no resolved inputs

- **Severity:** P3
- **Status:** confirmed by direct function reproduction on the assigned snapshot
- **Component:** `packages/state` canonical fingerprint helper
- **Location:** `packages/state/src/lib/fingerprint.ts:115–138`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** when the resolved map contains a producer ID with an empty input list, the resulting fingerprint should retain a producer entry with `inputs: []`; the helper's documentation explicitly allows pure producers with no inputs.
- **Actual:** the loop `continue`s when `sortedSpecs.length === 0`, so an explicit empty producer bucket disappears. An empty map and `new Map([['pure', []]])` both produce `{ abiVersion: 1, producers: [] }`.
- **Evidence:** direct invocation against the pinned source returned the same empty fingerprint for an empty map and a map containing a pure producer. `fingerprintFromProducers()` in `producer.ts:199–211` retains registered producers even when their resolved inputs are empty. The helper is re-exported through the package barrel, though no non-test call site was found in this snapshot.
- **Impact:** callers using this helper can produce a fingerprint that omits a pure producer; distinct producer registries can collapse to the same shape when the only differences are pure producers. Current exposure is limited because the snapshot has no production call site for this helper.
- **Root cause:** producer presence is inferred from nonempty resolved inputs rather than the keys of the supplied map.
- **Recommended fix:** create one fingerprint entry for every producer ID in `resolved`, including empty buckets; preserve current deterministic ID ordering.
- **Regression proof:** assert a map entry for a zero-input producer yields an entry with `inputs: []`, and that adding/removing a pure producer changes the producer list.
- **Confidence:** high on the helper's behavior; low current exposure because no production caller was found.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-STATE-003 — SQLite scope identity depends on locator property insertion order

- **Severity:** P2
- **Status:** confirmed by reproduction on the assigned snapshot
- **Component:** `packages/state-sqlite` scope cache and persisted scope keys
- **Location:** `packages/state-sqlite/src/lib/sqlite-driver.ts:927–935, 573–600, 730–818`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** `StateScope` identity depends on field values, not JavaScript object property insertion order; structurally equal locators must address one cache and one SQLite scope key.
- **Actual:** `scopeKey()` and `locatorJson()` use raw `JSON.stringify(scope.locator)`. Reordering the same locator fields yields a different cache key and persisted `scope_locator_json`. The in-memory delegate treats these as one scope, so state diverges between the delegate and SQLite cache namespaces.
- **Reproduction:** hydrated one registry twice with the same project scope values, first ordered `{ workspaceRoot, worktreeId, cacheRoot, docsRoot }`, then `{ docsRoot, cacheRoot, worktreeId, workspaceRoot }`. The delegate diagnosed generation `g000001-0001` as draining and `g000002-0002` as active, but SQLite stored two rows with different locator JSON strings; the first row retained its prior active snapshot. The temporary database was removed after the reproduction.
- **Evidence:** runtime result showed two rows for the same field values, distinguished only by JSON property order. `packages/state/src/lib/scope.ts:26–78` defines equality by explicit field comparisons, confirming property order is not identity.
- **Impact:** hosts that construct equivalent scope locators in different key orders can create split persisted state. On restart, restoration can treat those rows as separate caches while the in-memory driver aliases them, potentially restoring stale generations or losing coordination continuity.
- **Root cause:** raw insertion-order-sensitive JSON is used as a canonical identity encoding.
- **Recommended fix:** canonicalize locator keys (sorted structural serialization) before use in both cache keys and database identity columns; add restart coverage where equivalent locators use different property insertion orders.
- **Regression proof:** hydrate, persist, close and reopen using reordered-but-equal locator objects; assert one logical scope, correct active generation, and preserved coordination state.
- **Confidence:** high on split storage rows and mismatch with the contract's structural identity; medium on restart effects, which follow from the observed duplicate namespaces but were not exercised in this reproduction.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-EXEC-001 — Process runner buffers stdout and stderr without a bound

- **Severity:** P2
- **Status:** source-confirmed; impact depends on command/output control
- **Component:** `plugins/execution-env` process runner
- **Location:** `plugins/execution-env/src/lib/runners/spawn-process-runner.service.ts:30–60`; contract at `plugins/execution-env/src/lib/contracts/interfaces/process-runner.interface.ts:10–18`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** command output collection should have a bounded memory budget or stream output to a bounded sink, especially because callers may omit the optional timeout.
- **Actual:** each stdout/stderr `data` event appends a `Buffer` to unbounded arrays; on close the runner concatenates and decodes the entire output. The API has an optional `timeoutMs` but no output-byte limit or truncation signal.
- **Evidence:** source lines 30–60 retain all emitted chunks until process close; the public process-run options have no output cap. Existing `spawn-process-runner.spec.ts` covers arguments, spawn failure, stdin, timeout and dry-run refusal, but has no large-output boundary case.
- **Impact:** a command that emits output continuously, or very large output before its timeout, can grow the host's memory use until the process is killed or exhausts memory. The runner is exposed through the execution-environment package and can be reached by orchestrated command execution.
- **Root cause:** output is modeled as complete strings and buffered wholesale with no configured ceiling.
- **Recommended fix:** define a maximum combined/per-stream output size; stop retaining bytes beyond it while continuing to drain pipes, and expose truncation in the result. Consider a conservative default timeout for host-managed calls.
- **Regression proof:** run a child that emits more than the configured limit on both streams; assert bounded returned data, a truncation marker, and that the child is reaped cleanly.
- **Confidence:** high that memory consumption is unbounded in source; medium on exploitability because callers choose commands and may provide a timeout.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

### LUNA-EXTMCP-001 — External MCP transport has no maximum stdout frame size

- **Severity:** P2
- **Status:** source-confirmed; reproduction not yet run
- **Component:** `plugins/external-mcps` subprocess JSON-RPC framing
- **Location:** `plugins/external-mcps/src/lib/subprocess/server-registry.ts:210–232`
- **Snapshot:** `514758e783620c8953079be4d71fceccacb3de8b`
- **Expected:** newline-delimited protocol input should reject or cap an oversized frame while still draining/closing the child safely.
- **Actual:** every stdout chunk is appended to `buffer`; the parser only removes content after finding a newline. A child that continuously writes a line without `\n` grows the host's retained string without bound. There is no frame-size check before `JSON.parse`.
- **Evidence:** source appends at `buffer += chunk`, then loops only while `buffer.indexOf('\n') !== -1`. Existing registry specs exercise partial frames and malformed/noise lines, but do not cover a maximum frame or overlong unterminated output.
- **Impact:** a configured external MCP process can exhaust host memory through stdout even when each tool call has a reply timeout; timeout settles the caller but does not bound the framing buffer or terminate the child.
- **Root cause:** the transport assumes newline termination and has no byte budget for pending frame data.
- **Recommended fix:** enforce a maximum pending-frame byte count; on overflow, mark the transport unusable, fail outstanding requests, and terminate the child. Continue draining stderr without retaining it, as currently done.
- **Regression proof:** send a stream of chunks exceeding the limit without a newline; assert bounded memory state, all pending calls settle, status reports the failed child, and close behavior remains idempotent.
- **Confidence:** high on unbounded buffering from source; medium on practical impact because the process is explicitly configured by the workspace owner, though the code does not impose a trust boundary on its output.
- **Prior-audit relation:** not checked yet; phase A has not consulted other reviewers' findings.

## Next exact action

Continue Phase 1 against the same snapshot by resolving the `process.cwd()` discovery-helper disposition, tracing durable-write callers for containment and lock-key consistency, classifying worktree-agent sync I/O against its hook call paths, checking concurrent journal pruning, and reviewing the remaining core feature directories. Keep expanding the inventory; the detector rules/specs and all unreviewed packages remain open.
