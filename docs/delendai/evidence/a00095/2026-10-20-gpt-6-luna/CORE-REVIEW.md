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

- `createLazyPluginDiscovery` shares an in-flight scan and caches sorted plugin IDs/manifests. The reviewed code did not show a defect in the core cache path; this is a preliminary note, not full plugin-discovery signoff.
- `createShellStatusSnapshot` and its tool registration expose an `outputSchema`; a complete execution/security review of its process invocations remains pending.

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

## Next exact action

Continue Phase 1 against the same snapshot by tracing the core durable-write primitives and their consumers (`withFileMutex`, `writeFileAtomic`, workspace containment), then inspect work units, worktree state, manifests/discovery, tools and protocol assembly. Expand the inventory and add findings only with source-backed behavior or reproducible evidence.
