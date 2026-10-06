/**
 * permission-risk.ts — f00180 S3: per-tool permission-risk scoring.
 *
 * When a candidate declares the new `toolPermissions` map
 * (`IPluginToolPermissions`), the risk is computed per-tool rather
 * than per-plugin. A plugin with one high-risk tool and nine
 * read-only tools no longer drags every read-only tool into the
 * "needs write permission" bucket.
 *
 * Precedence (per f00180 acceptance):
 *  1. If the manifest has an entry in `toolPermissions` for `toolId`,
 *     use THAT set.
 *  2. Else fall back to the legacy global `permissions` array.
 *  3. Else return `0` (deny-by-default: no declared permission ⇒
 *     no risk weight).
 */
import {
	PERMISSION_RISK_WEIGHTS,
	resolveToolPermissions,
} from '@delendai/core/public';
import type {
	IPluginToolPermissions,
	PermissionCategory,
} from '@delendai/core/public';

export interface IPermissionRiskInput {
	/**
	 * New per-tool map (f00180). When `undefined`, the caller is
	 * using the legacy global `permissions` form only.
	 */
	readonly toolPermissions?: IPluginToolPermissions | undefined;
	/**
	 * Legacy global permission set. Applied when `toolPermissions`
	 * has no entry for the requested tool id.
	 */
	readonly permissions?: readonly PermissionCategory[] | undefined;
	/** Tool id whose risk is being scored. */
	readonly toolId: string;
}

/**
 * Sum of `PERMISSION_RISK_WEIGHTS` for the permission set this tool
 * declares. Returns `0` when no permission applies (deny-by-default
 * is the right answer — the risk surface IS zero because the tool
 * cannot act).
 */
export const scorePermissionRiskForTool = (
	input: IPermissionRiskInput,
): number => {
	const set = resolveToolPermissions(
		input.toolPermissions,
		input.permissions,
		input.toolId,
	);
	return set.reduce(
		(total, permission) => total + PERMISSION_RISK_WEIGHTS[permission],
		0,
	);
};

/**
 * Convenience overload for callers that have a manifest-like object
 * (with `toolPermissions` + `permissions`) but no specific tool id —
 * falls back to summing the global set. Used by the legacy scorer
 * path so backward compat is preserved.
 */
export const scorePermissionRiskForManifest = (manifest: {
	readonly toolPermissions?: IPluginToolPermissions | undefined;
	readonly permissions?: readonly PermissionCategory[] | undefined;
}): number => {
	const global = manifest.permissions ?? [];
	const perTool = manifest.toolPermissions ?? {};
	const union = new Set<PermissionCategory>(global);
	for (const permissions of Object.values(perTool)) {
		for (const permission of permissions) {
			union.add(permission);
		}
	}
	return [...union].reduce(
		(total, permission) => total + PERMISSION_RISK_WEIGHTS[permission],
		0,
	);
};
