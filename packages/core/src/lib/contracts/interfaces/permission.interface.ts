import type { PermissionCategory } from '../constants/permission-categories.constant';

export type { PermissionCategory } from '../constants/permission-categories.constant';

export interface IToolPermissionGrant {
	readonly tool: string;
	readonly permissions: readonly PermissionCategory[];
}
