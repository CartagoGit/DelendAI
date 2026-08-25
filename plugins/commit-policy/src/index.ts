/**
 * commit-policy WIP stub — f00181 deferred.
 *
 * The plugin is being implemented in /tmp/commit-policy-WIP-src-backup-*
 * by a parallel orchestration pass. The implementation has 6 typecheck
 * errors that exceed the q00005 closure scope:
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
 * this stub with a real `IMcpPlugin` registration is the
 * responsibility of the f00181 follow-up orchestration pass.
 */
export const COMMIT_POLICY_STUB = true;
