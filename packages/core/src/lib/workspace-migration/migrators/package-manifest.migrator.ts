/**
 * package-manifest.migrator.ts — b00239 S4.
 *
 * The structured migrator for `package.json`. Rewrites the manifest
 * so a workspace reflects the new product identity while leaving the
 * npm-managed fields (`version`, `engines`, `main`, `repository`,
 * …) untouched.
 *
 * ## Why this is a separate migrator
 *
 * `package.json` is a different shape from the project config: the
 * allow-list of fields that carry the product identity is narrower
 * (`name`, `dependencies*`, `peerDependencies`, `optionalDependencies`,
 * `scripts`, `workspaces`), the values follow npm's "scope/name"
 * convention for the dependency fields, and rewriting the wrong field
 * (e.g. `keywords`) would silently corrupt the package metadata. A
 * dedicated migrator is the only way to make the allow-list visible
 * to a reviewer.
 *
 * ## Lockfiles are explicitly out of scope
 *
 * `bun.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` are
 * NEVER substituted textually — they are machine-generated artefacts
 * owned by the package manager. The S4 acceptance criterion pins
 * this; S7 owns the actual `bun install` invocation that
 * regenerates them. This migrator emits a `manifest-changed` step
 * so the planner / transaction (S6) can record "the manifest moved,
 * refresh the lockfile" in the migration manifest.
 *
 * ## Why a single file at the workspace root
 *
 * Workspace members (the entries in `workspaces`) carry their own
 * `package.json`, but those are rewritten by walking into them with
 * the same migrator on a follow-up call. The orchestrator (S2's
 * `ensureWorkspaceMigrated`) treats each manifest as an independent
 * migration unit so a per-member failure does not abort the run.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from './identity-renames';

/** The single file this migrator owns at the workspace root. */
export const PACKAGE_MANIFEST_NAME = 'package.json';

/** Stable id recorded in the journal. NOT a number, by design. */
export const PACKAGE_MANIFEST_MIGRATOR_ID = 'packageManifestMigrator:v1';

/**
 * Structured failure surfaced to the engine when the file exists but
 * cannot be parsed. The engine catches the throw and records a
 * `failed` outcome; the migrator never silently writes a half-parsed
 * manifest back.
 */
export class PackageManifestParseError extends Error {
	readonly file: string;
	constructor(file: string, reason: string) {
		super(`package manifest ${file} is not valid JSON: ${reason}`);
		this.name = 'PackageManifestParseError';
		this.file = file;
	}
}

/**
 * The allow-list of top-level fields the migrator walks. Adding a
 * new field is a deliberate decision — these are the only places
 * the legacy identity can appear in a `package.json` and rewriting
 * anywhere else would be a guess.
 */
const MANIFEST_FIELDS_TO_REWRITE = [
	'name',
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
	'scripts',
	'workspaces',
] as const;

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

const readManifest = async (
	absolutePath: string,
): Promise<Record<string, unknown>> => {
	const text = await readFile(absolutePath, 'utf8');
	try {
		const parsed = JSON.parse(text);
		if (
			parsed === null ||
			typeof parsed !== 'object' ||
			Array.isArray(parsed)
		) {
			throw new PackageManifestParseError(
				absolutePath,
				'top-level value is not an object',
			);
		}
		return parsed as Record<string, unknown>;
	} catch (error) {
		if (error instanceof PackageManifestParseError) throw error;
		throw new PackageManifestParseError(
			absolutePath,
			error instanceof Error ? error.message : String(error),
		);
	}
};

/**
 * Walk one manifest field, rewriting any string that carries the
 * legacy identity. Returns a new value when something changed; the
 * unchanged case returns the input reference so callers can `===`
 * to decide whether to write back.
 *
 * For object values (e.g. `dependencies`, `devDependencies`,
 * `scripts`), BOTH the keys AND the string values are rewritten.
 * A package name like `@mcp-vertex/core` is the KEY of the entry,
 * not the value; leaving the key half-converted would produce a
 * manifest that npm cannot resolve.
 */
const rewriteField = (
	value: unknown,
): { readonly changed: boolean; readonly next: unknown } => {
	if (typeof value === 'string') {
		const rewritten = rewriteIdentityInString(value);
		return { changed: rewritten !== value, next: rewritten };
	}
	if (Array.isArray(value)) {
		let changed = false;
		const next = value.map((entry) => {
			if (typeof entry !== 'string') return entry;
			const rewritten = rewriteIdentityInString(entry);
			if (rewritten !== entry) changed = true;
			return rewritten;
		});
		return { changed, next };
	}
	if (value !== null && typeof value === 'object') {
		let changed = false;
		const next: Record<string, unknown> = {};
		for (const [key, child] of Object.entries(
			value as Record<string, unknown>,
		)) {
			const rewrittenKey = rewriteIdentityInString(key);
			if (rewrittenKey !== key) changed = true;
			const result = rewriteField(child);
			if (result.changed) changed = true;
			next[rewrittenKey] = result.next;
		}
		return { changed, next };
	}
	return { changed: false, next: value };
};

/**
 * Rewrite the fields a workspace manifest actually carries. Skips a
 * field entirely when it is not in the allow-list — that is what
 * keeps the "narrow scope" contract honest.
 */
const rewriteManifest = (
	manifest: Record<string, unknown>,
): { readonly changed: boolean; readonly next: Record<string, unknown> } => {
	let changed = false;
	const next: Record<string, unknown> = { ...manifest };
	for (const field of MANIFEST_FIELDS_TO_REWRITE) {
		if (!(field in next)) continue;
		const result = rewriteField(next[field]);
		if (result.changed) {
			changed = true;
			next[field] = result.next;
		}
	}
	return { changed, next };
};

/**
 * Cheap probe: does the manifest exist? One stat, no read.
 */
export const detectPackageManifest = async (
	workspaceRoot: string,
): Promise<boolean> => pathExists(join(workspaceRoot, PACKAGE_MANIFEST_NAME));

/**
 * What `apply` would do. Reports a single step that names the file
 * and surfaces the "lockfile refresh deferred to package manager"
 * note so the manifest record (S6) knows to flag the manifest as
 * needing a package-manager pass.
 */
export const planPackageManifest = async (
	workspaceRoot: string,
): Promise<readonly IMigrationPlanStep[]> => {
	const absolute = join(workspaceRoot, PACKAGE_MANIFEST_NAME);
	if (!(await pathExists(absolute))) return [];
	const manifest = await readManifest(absolute);
	const { changed } = rewriteManifest(manifest);
	if (!changed) return [];
	return [
		{
			kind: 'manifest-changed',
			detail: `${PACKAGE_MANIFEST_NAME}: legacy identity rewritten; lockfile refresh deferred to package manager (S7)`,
		},
	];
};

/**
 * Apply the structured migration to the manifest. Reads, walks the
 * allow-listed fields, rewrites any legacy identity references, and
 * writes the result back.
 */
export const applyPackageManifest = async (
	workspaceRoot: string,
): Promise<{ readonly migrated: boolean; readonly hits: number }> => {
	const absolute = join(workspaceRoot, PACKAGE_MANIFEST_NAME);
	if (!(await pathExists(absolute))) return { migrated: false, hits: 0 };
	const manifest = await readManifest(absolute);
	const { changed, next } = rewriteManifest(manifest);
	if (!changed) return { migrated: false, hits: 0 };
	const hits = countHits(manifest, next);
	await writeFile(absolute, `${JSON.stringify(next, null, '\t')}\n`, 'utf8');
	return { migrated: true, hits };
};

/**
 * Count how many string leaves differed between the original and
 * the rewritten manifest. The walk is shallow on purpose: a single
 * pass per allow-listed field, since that is the only surface this
 * migrator touches.
 */
const countHits = (
	before: Record<string, unknown>,
	after: Record<string, unknown>,
): number => {
	let hits = 0;
	for (const field of MANIFEST_FIELDS_TO_REWRITE) {
		if (!(field in before)) continue;
		hits += countFieldHits(before[field], after[field]);
	}
	return hits;
};

const countFieldHits = (before: unknown, after: unknown): number => {
	if (typeof before === 'string') return before !== after ? 1 : 0;
	if (Array.isArray(before) && Array.isArray(after)) {
		let total = 0;
		const length = Math.min(before.length, after.length);
		for (let index = 0; index < length; index += 1) {
			total += countFieldHits(before[index], after[index]);
		}
		return total;
	}
	if (
		before !== null &&
		typeof before === 'object' &&
		!Array.isArray(before) &&
		after !== null &&
		typeof after === 'object' &&
		!Array.isArray(after)
	) {
		let total = 0;
		for (const [key, value] of Object.entries(
			before as Record<string, unknown>,
		)) {
			total += countFieldHits(
				value,
				(after as Record<string, unknown>)[key],
			);
		}
		return total;
	}
	return 0;
};

/**
 * Factory: a fresh migrator instance. Pure at import time,
 * side-effect free until `apply` is called.
 */
export const createPackageManifestMigrator = (): IMigration => ({
	id: PACKAGE_MANIFEST_MIGRATOR_ID,

	detect: async (ctx: IMigrationContext) =>
		detectPackageManifest(ctx.workspaceRoot),

	plan: async (
		ctx: IMigrationContext,
	): Promise<readonly IMigrationPlanStep[]> =>
		planPackageManifest(ctx.workspaceRoot),

	apply: async (ctx: IMigrationContext) => {
		await applyPackageManifest(ctx.workspaceRoot);
	},
});

/** Re-export so the planner step can include the legacy-vs-new wording. */
export { stringHasLegacyIdentity };
