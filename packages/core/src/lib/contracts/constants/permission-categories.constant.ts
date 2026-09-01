export const PERMISSION_CATEGORIES = [
	'filesystem-read',
	'filesystem-write',
	'process',
	'network',
	'git-read',
	'git-write',
	'forge-read',
	'forge-write',
	'env-read',
	'secrets',
	'browser',
	'container',
	'database',
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export const PERMISSION_RISK_WEIGHTS: Readonly<
	Record<PermissionCategory, number>
> = {
	'filesystem-read': 1,
	'filesystem-write': 3,
	process: 4,
	network: 2,
	'git-read': 1,
	'git-write': 3,
	'forge-read': 2,
	'forge-write': 4,
	'env-read': 2,
	secrets: 5,
	browser: 3,
	container: 4,
	database: 2,
};
