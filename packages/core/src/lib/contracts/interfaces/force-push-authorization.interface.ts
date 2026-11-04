/**
 * force-push-authorization.interface.ts — auditable sign-off for a force
 * push, shared by `shared/git-write.ts`'s `gitPush`/`commitAndPush`.
 *
 * `IPushAuthorization` is the explicit consent a caller must supply to
 * force-push `force: 'true'` (or force into a protected branch): a bare
 * string on `force` is not consent for an irreversible, history-rewriting
 * operation against a shared remote. `IForcePushAuthorizationRecord` is
 * the audit-trail shape `gitPush` appends to for every authorized force
 * push it performs.
 */

/**
 * Both fields are required and must be non-empty so a buggy caller cannot
 * manufacture authorization by passing `{}`.
 */
export interface IPushAuthorization {
	/** Who/what granted this — an agent name, a host operator, a config id. */
	readonly by: string;
	/** Why this force push is warranted. Becomes part of the audit record. */
	readonly reason: string;
}

/**
 * Audit trail for authorized force pushes (bounded ring buffer, in
 * process memory — mirrors the same "record the bypass" convention used
 * for peer-review force-closes). Not a persistence layer: a host that
 * needs durable audit logs reads this immediately after `gitPush`
 * resolves, or wires its own sink around the `authorization` it passed
 * in.
 */
export interface IForcePushAuthorizationRecord {
	readonly ts: string;
	readonly by: string;
	readonly reason: string;
	readonly branch: string | undefined;
	readonly forceMode: 'with-lease' | 'true';
}
