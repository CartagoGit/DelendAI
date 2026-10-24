/**
 * vscode.migrator.ts — b00239 S4.
 *
 * Rewrites the VS Code extension manifest at
 * `<workspaceRoot>/extensions/vscode/package.json` so the extension
 * ships under the new product identity.
 *
 * ## Scope, narrow on purpose
 *
 * Owns ONE file: the VS Code extension package.json. Touches only
 * the fields that carry the product identity:
 *
 *  - `publisher` (rare, but possible)
 *  - `name`, `displayName`, `description`
 *  - `activationEvents` (e.g. the workspaceContains event for the config file)
 *  - `contributes.commands[].command` (e.g. `delendai.openOverview`)
 *  - `contributes.commands[].category` (e.g. `DelendAI`)
 *  - `contributes.viewsContainers.activitybar[].id`, `.title`
 *  - `contributes.views[container][].id`
 *  - `contributes.productIconThemes[].id`, `.path`, `.label`
 *  - `contributes.menus` (command references inside menu items)
 *
 * Unrelated fields (`version`, `engines`, `main`, `repository`, …)
 * pass through untouched. A blind rewrite of the whole manifest
 * would be exactly the failure the S4 acceptance criterion
 * forbids.
 *
 * ## Why JSON.parse, not JSONC
 *
 * `package.json` is JSON by spec; the extension manifest is the
 * same. JSON.parse is what `npm`, `bun` and `vsce` themselves do.
 *
 * ## Lockfiles are explicitly out of scope (S7)
 *
 * The migrator does NOT touch `extensions/vscode/yarn.lock` or
 * similar; the package manager regenerates those.
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

/** The single file this migrator owns. */
export const VSCODE_MANIFEST_PATH = 'extensions/vscode/package.json';

/** Stable id recorded in the journal. NOT a number, by design. */
export const VSCODE_MIGRATOR_ID = 'vscodeMigrator:v1';

/** Top-level string fields that may carry the product identity. */
const VSCODE_TOP_STRING_FIELDS = [
	'publisher',
	'name',
	'displayName',
	'description',
] as const;

export class VscodeManifestParseError extends Error {
	readonly file: string;
	constructor(file: string, reason: string) {
		super(`vscode manifest ${file} is not valid JSON: ${reason}`);
		this.name = 'VscodeManifestParseError';
		this.file = file;
	}
}

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

const readVscodeManifest = async (
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
			throw new VscodeManifestParseError(
				absolutePath,
				'top-level value is not an object',
			);
		}
		return parsed as Record<string, unknown>;
	} catch (error) {
		if (error instanceof VscodeManifestParseError) throw error;
		throw new VscodeManifestParseError(
			absolutePath,
			error instanceof Error ? error.message : String(error),
		);
	}
};

/**
 * Walk one object and rewrite every string value in place. Returns
 * a new object only when something changed; the unchanged case
 * returns the input reference so callers can `===` to decide
 * whether to write back.
 */
const rewriteObjectStrings = (
	value: Record<string, unknown>,
): { changed: boolean; next: Record<string, unknown> } => {
	let changed = false;
	const next: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		const rewrittenKey = rewriteIdentityInString(key);
		if (rewrittenKey !== key) changed = true;
		if (typeof child === 'string') {
			const rewritten = rewriteIdentityInString(child);
			if (rewritten !== child) changed = true;
			next[rewrittenKey] = rewritten;
			continue;
		}
		if (Array.isArray(child)) {
			let arrayChanged = false;
			const nextArray = child.map((entry) => {
				if (typeof entry === 'string') {
					const rewritten = rewriteIdentityInString(entry);
					if (rewritten !== entry) arrayChanged = true;
					return rewritten;
				}
				if (
					entry !== null &&
					typeof entry === 'object' &&
					!Array.isArray(entry)
				) {
					const result = rewriteObjectStrings(
						entry as Record<string, unknown>,
					);
					if (result.changed) arrayChanged = true;
					return result.next;
				}
				return entry;
			});
			if (arrayChanged) changed = true;
			next[rewrittenKey] = nextArray;
			continue;
		}
		if (child !== null && typeof child === 'object') {
			const result = rewriteObjectStrings(
				child as Record<string, unknown>,
			);
			if (result.changed) changed = true;
			next[rewrittenKey] = result.next;
			continue;
		}
		next[rewrittenKey] = child;
	}
	return { changed, next };
};

const rewriteVscodeManifest = (
	manifest: Record<string, unknown>,
): { readonly changed: boolean; readonly next: Record<string, unknown> } => {
	let changed = false;
	const next: Record<string, unknown> = { ...manifest };

	for (const field of VSCODE_TOP_STRING_FIELDS) {
		const value = next[field];
		if (typeof value !== 'string') continue;
		const rewritten = rewriteIdentityInString(value);
		if (rewritten !== value) {
			changed = true;
			next[field] = rewritten;
		}
	}

	if (Array.isArray(next.activationEvents)) {
		let evChanged = false;
		const nextEvents = next.activationEvents.map((entry) => {
			if (typeof entry !== 'string') return entry;
			const rewritten = rewriteIdentityInString(entry);
			if (rewritten !== entry) evChanged = true;
			return rewritten;
		});
		if (evChanged) {
			changed = true;
			next.activationEvents = nextEvents;
		}
	}

	if (
		next.contributes !== null &&
		typeof next.contributes === 'object' &&
		!Array.isArray(next.contributes)
	) {
		const result = rewriteObjectStrings(
			next.contributes as Record<string, unknown>,
		);
		if (result.changed) {
			changed = true;
			next.contributes = result.next;
		}
	}

	return { changed, next };
};

/**
 * Factory: a fresh migrator instance. Pure at import time,
 * side-effect free until `apply` is called.
 */
export const createVscodeMigrator = (): IMigration => {
	const absoluteManifestPath = (ctx: IMigrationContext): string =>
		join(ctx.workspaceRoot, VSCODE_MANIFEST_PATH);

	return {
		id: VSCODE_MIGRATOR_ID,

		detect: async (ctx) => pathExists(absoluteManifestPath(ctx)),

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> => {
			const absolute = absoluteManifestPath(ctx);
			if (!(await pathExists(absolute))) return [];
			const manifest = await readVscodeManifest(absolute);
			const { changed } = rewriteVscodeManifest(manifest);
			if (!changed) return [];
			return [
				{
					kind: 'rewrite-vscode-manifest',
					detail: `${VSCODE_MANIFEST_PATH}: legacy identity rewritten`,
				},
			];
		},

		apply: async (ctx) => {
			const absolute = absoluteManifestPath(ctx);
			if (!(await pathExists(absolute))) return;
			const manifest = await readVscodeManifest(absolute);
			const { changed, next } = rewriteVscodeManifest(manifest);
			if (!changed) return;
			await writeFile(
				absolute,
				`${JSON.stringify(next, null, '\t')}\n`,
				'utf8',
			);
		},
	};
};

export { stringHasLegacyIdentity };
