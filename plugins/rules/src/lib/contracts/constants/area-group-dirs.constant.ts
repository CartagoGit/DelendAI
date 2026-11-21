/**
 * area-group-dirs.constant.ts — the folders that hold areas one level
 * down (`apps/web`, `services/api`). Both manifest builders read this
 * one list, so the composed one cannot drop a group the legacy one had.
 */
export const AREA_GROUP_DIRS = [
	'apps',
	'libs',
	'packages',
	'projects',
	'services',
] as const;
