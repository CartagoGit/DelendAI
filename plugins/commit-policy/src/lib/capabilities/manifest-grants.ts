import {
	resolveToolPermissions,
	type IPluginManifest,
	type PermissionCategory,
} from '@delendai/core/public';

export interface IManifestCapabilityGrant {
	readonly pluginId: string;
	readonly toolId: string;
	readonly permissions: readonly PermissionCategory[];
	readonly approvalRequired: boolean;
	readonly source: 'manifest-tool' | 'manifest-plugin' | 'merged';
}

const dedupePermissions = (
	permissions: readonly PermissionCategory[],
): readonly PermissionCategory[] =>
	Object.freeze(
		[...new Set(permissions)].sort((left, right) =>
			left.localeCompare(right),
		),
	);

export const capabilityGrantFromManifest = (
	manifest: IPluginManifest,
	toolId: string,
): IManifestCapabilityGrant => {
	const permissions = dedupePermissions(
		resolveToolPermissions(
			manifest.toolPermissions,
			manifest.permissions,
			toolId,
		),
	);
	const source = manifest.toolPermissions?.[toolId]
		? 'manifest-tool'
		: 'manifest-plugin';
	return Object.freeze({
		pluginId: manifest.id,
		toolId,
		permissions,
		approvalRequired: permissions.length > 0,
		source,
	});
};

export const mergeCapabilityGrants = (
	grants: readonly IManifestCapabilityGrant[],
): IManifestCapabilityGrant => {
	const permissions = dedupePermissions(
		grants.flatMap((grant) => [...grant.permissions]),
	);
	return Object.freeze({
		pluginId: grants.map((grant) => grant.pluginId).join('+') || 'merged',
		toolId: grants.map((grant) => grant.toolId).join('+') || 'merged',
		permissions,
		approvalRequired: grants.some((grant) => grant.approvalRequired),
		source: 'merged',
	});
};
