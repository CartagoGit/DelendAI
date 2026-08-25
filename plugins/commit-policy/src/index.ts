/**
 * commit-policy WIP stub — f00181 deferred.
 *
 * The full plugin (commit authority wrapping git primitives) is in
 * `/tmp/commit-policy-WIP-src-backup-*` and was started by a previous
 * orchestration pass. It surfaces 6 typecheck errors in 4 files that
 * exceeded the scope of the q00005 orchestration pass:
 *
 *   - `identity/resolver.ts(81,2)` and `(97,3)`:
 *     `string | undefined` not assignable to optional `string` under
 *     `exactOptionalPropertyTypes: true`.
 *   - `commit-driver.ts(17,2)`: missing core export
 *     `gitCurrentBranch`.
 *   - `status-tool.ts(173,12)`: `IToolEffect` union no longer includes
 *     raw `'read'` strings.
 *   - `commit-tool.ts(99,53)`, `(121,30,49)`: callback signature
 *     mismatch — return type expects `string` but the function
 *     returns `{ summary, nextAction }`.
 *
 * Restoring the WIP, addressing the typecheck errors, and replacing
 * this stub with a real `IMcpPlugin` registration that exposes
 * `commit_policy_status`, `commit_policy_commit`, `commit_policy_push`,
 * `commit_policy_run` is left for a follow-up orchestration pass.
 */
export const COMMIT_POLICY_STUB = true;
