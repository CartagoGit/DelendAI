import z from 'zod';

import { PERMISSION_CATEGORIES } from '../contracts/constants/permission-categories.constant';
import type { PermissionCategory } from '../contracts/constants/permission-categories.constant';
import type { IPluginToolPermissions } from '../contracts/interfaces/plugin-tool-permissions.interface';

export const permissionCategorySchema = z.enum(PERMISSION_CATEGORIES);

/**
 * The legacy global `permissions` array. Still required on every
 * manifest — the per-tool `toolPermissions` map inherits from this
 * when a specific tool has no entry of its own.
 */
export const permissionListSchema = z
	.array(permissionCategorySchema)
	.min(1, 'permissions must not be empty')
	.superRefine((values, ctx) => {
		const seen = new Set<PermissionCategory>();
		for (const value of values) {
			if (seen.has(value)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'permissions entries must be unique',
				});
				return;
			}
			seen.add(value);
		}
	}) satisfies z.ZodType<readonly PermissionCategory[]>;

/**
 * f00180 S1: per-tool permission map. Keys are bare tool ids
 * (without the `delendai_<plugin>_` namespace prefix); values are
 * the permission categories each tool actually requires. Keys must
 * be unique; values must be a non-empty subset of
 * `PERMISSION_CATEGORIES` with no duplicates.
 */
export const toolPermissionsSchema = z
	.record(
		z.string().trim().min(1, 'tool id must be non-empty'),
		permissionListSchema,
	)
	.superRefine((value, ctx) => {
		for (const [tool, permissions] of Object.entries(value)) {
			if (tool.trim().length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: [tool],
					message: 'tool id must be non-empty',
				});
			}
			if (permissions.length === 0) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: [tool],
					message: 'tool permission set must be non-empty',
				});
			}
		}
	}) satisfies z.ZodType<IPluginToolPermissions>;

/**
 * Legacy export kept for backwards compatibility. The old per-tool
 * grant array shape is no longer accepted by `definePluginManifest`
 * — only the new map form is — but the type is preserved so
 * community tooling that still imports it does not break at
 * compile time. Cast / migrate at the call site.
 */
export interface IToolPermissionGrant {
	readonly tool: string;
	readonly permissions: readonly PermissionCategory[];
}

export const toolPermissionGrantSchema = z.object({
	tool: z.string().trim().min(1, 'tool must be non-empty'),
	permissions: permissionListSchema,
}) satisfies z.ZodType<IToolPermissionGrant>;
