/**
 * plugin-tool-permissions.interface.ts — f00180 S1: per-tool
 * `toolPermissions` shape for plugin manifests.
 *
 * `MAN-004` (P3, MEJORA): today `toolPermissions` is either a single
 * global array (forcing the whole plugin to inherit its risk) or
 * declared as `IToolPermissionGrant[]` with a `tool` field that is
 * almost never filled. Adaptive selection cannot refine the
 * permission set it is asking the host to grant — it sees the
 * whole plugin or nothing.
 *
 * The new shape is a map from each tool id (the tool's bare id,
 * without the `delendai_<plugin>_` namespace prefix) to the
 * permission set the tool actually requires. Hosts and the
 * `auto-plugin-selector` scorer consult the per-tool set when
 * deciding whether to grant a specific tool under a specific
 * permission budget.
 *
 * Backward compat (f00180 acceptance):
 *  - `permissions: PermissionCategory[]` (the GLOBAL array) still
 *    works — interpreted as the permission set for EVERY tool in
 *    the plugin when no per-tool entry exists.
 *  - The legacy `IToolPermissionGrant[]` array form (the previous
 *    `toolPermissions` shape) is now an export-only type — no
 *    manifest declares it any more; the schema validator enforces
 *    the new map shape.
 */
import type { PermissionCategory } from '../constants/permission-categories.constant';

/**
 * Per-tool permission set. Keys are tool ids (the bare tool id
 * before the `delendai_<plugin>_` namespace prefix is applied).
 * Values are the permission categories the tool requires. Every
 * key SHOULD correspond to a tool registered by the plugin, but the
 * schema does NOT enforce that — plugins can evolve their tool
 * roster independently of their manifest.
 */
export type IPluginToolPermissions = Readonly<
	Record<string, readonly PermissionCategory[]>
>;

/**
 * Resolve the permission set for a specific tool. When the manifest
 * declares the new per-tool map, this returns the tool's entry. When
 * the manifest only declares the legacy global `permissions` array,
 * the global set applies. When neither is present, returns an empty
 * array (deny-by-default; the host is responsible for explicit grant).
 *
 * Pure: no I/O, no clock.
 */
export const resolveToolPermissions = (
	perTool: IPluginToolPermissions | undefined,
	globalPermissions: readonly PermissionCategory[] | undefined,
	toolId: string,
): readonly PermissionCategory[] => {
	const fromMap = perTool?.[toolId];
	if (fromMap !== undefined) return fromMap;
	return globalPermissions ?? [];
};
