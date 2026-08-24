import { z } from 'zod';

import { PERMISSION_CATEGORIES } from '../contracts/constants/permission-categories.constant';
import type { IToolPermissionGrant } from '../contracts/interfaces/permission.interface';
import type { PermissionCategory } from '../contracts/constants/permission-categories.constant';

export const permissionCategorySchema = z.enum(PERMISSION_CATEGORIES);

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

export const toolPermissionGrantSchema = z.object({
	tool: z.string().trim().min(1, 'tool must be non-empty'),
	permissions: permissionListSchema,
}) satisfies z.ZodType<IToolPermissionGrant>;

export const toolPermissionsSchema = z
	.array(toolPermissionGrantSchema)
	.superRefine((values, ctx) => {
		const seen = new Set<string>();
		for (const value of values) {
			if (seen.has(value.tool)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'toolPermissions tools must be unique',
				});
				return;
			}
			seen.add(value.tool);
		}
	});
