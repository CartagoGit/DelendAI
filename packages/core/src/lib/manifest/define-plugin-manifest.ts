import { z } from 'zod';

import type {
	IPluginManifest,
	PluginManifestMaturity,
	PluginManifestVisibility,
} from '../contracts/interfaces/plugin-manifest.interface';

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
		permissions: nonEmptyList('permissions'),
		presets: nonEmptyList('presets'),
		tokenBudget: z.object({
			hard: z.number().finite().positive(),
			warning: z.number().finite().positive(),
			releaseRelativePercent: z.number().finite().nonnegative(),
		}),
		dependencies: nonEmptyList('dependencies'),
		capabilities: nonEmptyList('capabilities'),
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
		if (manifest.tokenBudget.warning > manifest.tokenBudget.hard) {
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
