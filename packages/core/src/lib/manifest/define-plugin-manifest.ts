import { z } from 'zod';

import type {
	IPluginManifest,
	IPluginManifestTokenBudget,
	PluginManifestMaturity,
	PluginManifestVisibility,
} from '../contracts/interfaces/plugin-manifest.interface';
import type { IPluginTokenBudget } from '../contracts/interfaces/plugin-token-budget.interface';
import {
	permissionListSchema,
	toolPermissionsSchema,
} from './permissions.schema';

const SEMVER_PATTERN =
	/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const PACKAGE_PATTERN = /^@mcp-vertex\/[a-z][a-z0-9-]*$/u;

const nonEmptyList = (label: string) =>
	z
		.array(z.string().trim().min(1, `${label} entries must be non-empty`))
		.superRefine((values, ctx) => {
			const seen = new Set<string>();
			for (const value of values) {
				if (seen.has(value)) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: `${label} entries must be unique`,
					});
					return;
				}
				seen.add(value);
			}
		});

const VISIBILITY_SCHEMA = z.enum([
	'public',
	'private',
]) satisfies z.ZodType<PluginManifestVisibility>;
const MATURITY_SCHEMA = z.enum([
	'experimental',
	'beta',
	'stable',
]) satisfies z.ZodType<PluginManifestMaturity>;

/**
 * f00179 S1 / MAN-003: `tokenBudget` accepts the new real-semantics
 * `IPluginTokenBudget` shape, the legacy `ITokenBudgetCeiling` (with
 * `releaseRelativePercent`), or a bare number. The discriminator is
 * the presence of `staticBytes` (only the new shape carries it). See
 * `plugin-token-budget.interface.ts#resolveTokenBudget` for the
 * canonical normaliser.
 */
const TOKEN_BUDGET_NEW_SCHEMA = z
	.object({
		staticBytes: z.number().finite().positive(),
		adaptiveActivationBytes: z.number().finite().nonnegative().optional(),
		typicalOutput: z.number().finite().nonnegative().optional(),
		caps: z.object({
			hard: z.number().finite().positive(),
			warning: z.number().finite().positive(),
		}),
		measuredAt: z
			.string()
			.regex(
				/^\d{4}-\d{2}-\d{2}$/u,
				'measuredAt must be an ISO date (YYYY-MM-DD)',
			),
		source: z.string().trim().min(1, 'source must be non-empty'),
	})
	.superRefine((value, ctx) => {
		if (value.caps.warning > value.caps.hard) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['caps', 'warning'],
				message: 'caps.warning must be <= caps.hard',
			});
		}
	}) satisfies z.ZodType<IPluginTokenBudget>;

const TOKEN_BUDGET_LEGACY_SCHEMA = z.object({
	hard: z.number().finite().positive(),
	warning: z.number().finite().positive(),
	releaseRelativePercent: z.number().finite().nonnegative(),
}) satisfies z.ZodType<{
	readonly hard: number;
	readonly warning: number;
	readonly releaseRelativePercent: number;
}>;

const TOKEN_BUDGET_SCHEMA = z.union([
	z.number().finite().positive(),
	TOKEN_BUDGET_LEGACY_SCHEMA,
	TOKEN_BUDGET_NEW_SCHEMA,
]) satisfies z.ZodType<IPluginManifestTokenBudget>;

const PLUGIN_MANIFEST_SCHEMA = z
	.object({
		id: z.string().regex(PLUGIN_ID_PATTERN, 'id must be kebab-case'),
		package: z
			.string()
			.regex(PACKAGE_PATTERN, 'package must be @mcp-vertex/<id>'),
		version: z
			.string()
			.regex(SEMVER_PATTERN, 'version must be a semver literal'),
		visibility: VISIBILITY_SCHEMA,
		summary: z.string().trim().min(10, 'summary must be at least 10 chars'),
		tags: nonEmptyList('tags').min(1, 'tags must not be empty'),
		maturity: MATURITY_SCHEMA,
		permissions: permissionListSchema,
		toolPermissions: toolPermissionsSchema.optional(),
		presets: nonEmptyList('presets'),
		tokenBudget: TOKEN_BUDGET_SCHEMA,
		dependencies: nonEmptyList('dependencies'),
		capabilities: nonEmptyList('capabilities'),
		startupActivation: z.boolean().optional(),
	})
	.superRefine((manifest, ctx) => {
		const expectedPackage = `@mcp-vertex/${manifest.id}`;
		if (manifest.package !== expectedPackage) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['package'],
				message: `package must match id (${expectedPackage})`,
			});
		}
		// Legacy-shape-only invariant: `warning <= hard`. The new
		// shape's superRefine handles the same invariant inside
		// `caps`. A bare-number shape has no warning to check.
		if (
			typeof manifest.tokenBudget === 'object' &&
			'warning' in manifest.tokenBudget &&
			'releaseRelativePercent' in manifest.tokenBudget &&
			manifest.tokenBudget.warning > manifest.tokenBudget.hard
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['tokenBudget', 'warning'],
				message: 'tokenBudget.warning must be <= tokenBudget.hard',
			});
		}
	}) satisfies z.ZodType<IPluginManifest>;

export const parsePluginManifest = (manifest: unknown): IPluginManifest =>
	PLUGIN_MANIFEST_SCHEMA.parse(manifest);

export const definePluginManifest = <const T extends IPluginManifest>(
	manifest: T,
): T => parsePluginManifest(manifest) as T;

export type { IPluginManifest } from '../contracts/interfaces/plugin-manifest.interface';
