# Core review — independent phase A

Auditor: `gpt-6-luna`  
Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`  
Status: in progress; this is not a complete core review or a final audit.

## Coverage checkpoint

| Area | Inventory | Review status | Notes |
|---|---:|---|---|
| `packages/core/src/lib` | 977 TypeScript files in 66 immediate feature directories | In progress | Inventory read from Git tree. Began with filesystem/persistence, mutation idempotency, plugin discovery, and shell-status paths. Remaining core files/directories are not yet assessed. |
| Core specs | Inventory found 200+ spec files; exact exhaustive classification pending | In progress | Read idempotency and file-artifact-store specs. Neither covers same-key concurrent operations. |
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

- **Reproduction:** from the snapshot checkout, run 40 simultaneous `store.put(key, { i })` calls against one fresh temporary root. Result: `5` fulfilled, `35` rejected; the final record was `{ "i": 39 }`. Command was an inline Bun reproduction; no product files were changed.
- **Evidence:** source lines 59–73 derive one PID-scoped temporary path for every operation; `Promise.allSettled` reproduction returned `{"ok":5,"failed":35,"final":{"i":39},"temps":[]}`. Existing `packages/core/tests/src/lib/context-store/file-artifact-store.spec.ts` tests sequential puts, list/get/delete, and compiler integration, but not simultaneous puts.
- **Impact:** concurrent producers of the same artifact key can receive write failures instead of persisted results. Callers may fail a compilation/update despite each record replacement being individually rename-based.
- **Root cause:** atomic rename protects readers from partial contents, but the temporary name is not unique per write and the `put()` read-modify-write sequence has no per-key serialization.
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

## Pending lead, not a finding

The prior pending lead on `createIdempotencyStore.withIdempotency()` has been reproduced and moved to `LUNA-CORE-002` above.

## Next exact action

Continue Phase 1 against the same snapshot by tracing the core durable-write primitives and their consumers (`withFileMutex`, `writeFileAtomic`, workspace containment), then inspect work units, worktree state, manifests/discovery, tools and protocol assembly. Expand the inventory and add findings only with source-backed behavior or reproducible evidence.
