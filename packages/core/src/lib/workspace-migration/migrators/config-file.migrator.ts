/**
 * config-file.migrator.ts — b00239 S4.
 *
 * Rewrites the project configuration file in place.
 *
 * ## Scope, narrow on purpose
 *
 * This migrator owns ONE file: the JSONC config at
 * `<workspaceRoot>/delendai.config.json`. It reads it through
 * `jsonc-parser` (because the format is JSONC by contract — comments
 * must round-trip), walks every string value, and rewrites the legacy
 * identity tokens in place. It does NOT touch `package.json`, the
 * cache/docs directories, or any other structured file — those have
 * their own migrators.
 *
 * ## Why JSONC, not JSON.parse
 *
 * The config file has always been allowed to carry comments and a
 * user's manual formatting. A `JSON.parse` round trip would silently
 * delete them, which is exactly the "blind text substitution over
 * structured files" failure the S4 acceptance criterion forbids. The
 * shared `parseJsonc` / `applyJsoncEdits` helpers in
 * `lib/config/jsonc-document.ts` keep the round trip lossless.
 *
 * ## Detect / plan / apply shape
 *
 *  - detect: a single `access` call. The cheap probe.
 *  - plan: enumerates the field paths that would be rewritten (so
 *    `--dry-run` reports a precise change list, not a vague "the
 *    config file would change").
 *  - apply: walk → rewrite → write. Idempotent: a re-run over an
 *    already-migrated file is a no-op.
 */
import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	applyEdits,
	modify,
	parse as parseJsonc,
	type ParseError,
} from 'jsonc-parser';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';

import {
	rewriteIdentityInString,
	stringHasLegacyIdentity,
} from './identity-renames';

/** The single file this migrator owns. Stable for the lifetime of v1. */
export const CONFIG_FILE_NAME = 'delendai.config.json';

/** Stable id recorded in the journal. NOT a number, by design. */
export const CONFIG_FILE_MIGRATOR_ID = 'configFileMigrator:v1';

/**
 * Structured failure surfaced to the engine when the file exists but
 * cannot be parsed. The engine catches the throw and records a
 * `failed` outcome; the migrator never silently writes a half-parsed
 * document back.
 */
export class ConfigFileParseError extends Error {
	readonly file: string;
	readonly offset: number;
	constructor(file: string, offset: number, reason: string) {
		super(
			`config file ${file} is not parseable JSONC at offset ${offset}: ${reason}`,
		);
		this.name = 'ConfigFileParseError';
		this.file = file;
		this.offset = offset;
	}
}

const pathExists = async (absolutePath: string): Promise<boolean> =>
	access(absolutePath).then(
		() => true,
		() => false,
	);

/**
 * Walk an arbitrary JSON value and yield every string at the leaves.
 *
 * Objects yield `(path, value)` for every string-typed member;
 * arrays yield `(path, value)` for every string element;
 * non-string members are recursed into. The returned path is a
 * JSON-Pointer-style array of keys/indices so callers can target
 * the rewrite.
 */
const collectStringLeaves = (
	node: unknown,
	prefix: readonly (string | number)[] = [],
): {
	readonly path: readonly (string | number)[];
	readonly value: string;
}[] => {
	if (typeof node === 'string') {
		return [{ path: prefix, value: node }];
	}
	if (Array.isArray(node)) {
		const out: { path: readonly (string | number)[]; value: string }[] = [];
		for (let index = 0; index < node.length; index += 1) {
			out.push(...collectStringLeaves(node[index], [...prefix, index]));
		}
		return out;
	}
	if (node !== null && typeof node === 'object') {
		const out: { path: readonly (string | number)[]; value: string }[] = [];
		for (const [key, child] of Object.entries(node)) {
			out.push(...collectStringLeaves(child, [...prefix, key]));
		}
		return out;
	}
	return [];
};

/**
 * Read the file, surface a parse failure as a typed error.
 *
 * `parseJsonc` returns errors AND a value (recoverable parsing); we
 * treat any error as fatal because a config file the user wrote by
 * hand and a config file the migrator rewrites must agree on the
 * structure, and "the migrator happily rewrote a half-broken file"
 * is the failure mode the typed error exists to prevent.
 */
const readConfigTree = async (
	absolutePath: string,
): Promise<{ readonly text: string; readonly root: unknown }> => {
	const text = await readFile(absolutePath, 'utf8');
	const errors: ParseError[] = [];
	const root = parseJsonc(text, errors, { allowTrailingComma: true });
	if (errors.length > 0) {
		const first = errors[0]!;
		throw new ConfigFileParseError(
			absolutePath,
			first.offset,
			String(first.error),
		);
	}
	return { text, root };
};

/**
 * Factory: a fresh migrator instance. Pure at import time, side-effect
 * free until `apply` is called.
 */
export const createConfigFileMigrator = (): IMigration => {
	const absoluteConfigPath = (ctx: IMigrationContext): string =>
		join(ctx.workspaceRoot, CONFIG_FILE_NAME);

	return {
		id: CONFIG_FILE_MIGRATOR_ID,

		detect: async (ctx) => pathExists(absoluteConfigPath(ctx)),

		plan: async (ctx): Promise<readonly IMigrationPlanStep[]> => {
			const absolute = absoluteConfigPath(ctx);
			if (!(await pathExists(absolute))) return [];
			const { root } = await readConfigTree(absolute);
			const leaves = collectStringLeaves(root);
			const hits = leaves.filter((leaf) =>
				stringHasLegacyIdentity(leaf.value),
			);
			if (hits.length === 0) return [];
			return [
				{
					kind: 'rewrite-config-file',
					detail: `${CONFIG_FILE_NAME}: ${hits.length} string field(s) carry the legacy identity`,
				},
			];
		},

		apply: async (ctx) => {
			const absolute = absoluteConfigPath(ctx);
			if (!(await pathExists(absolute))) return;
			const { text, root } = await readConfigTree(absolute);

			// Rewrite each leaf in place through `jsonc-parser`'s
			// in-place modifier so comments survive untouched. A
			// whole-document `JSON.stringify` round trip would drop
			// every comment the user wrote.
			let working = text;
			const leaves = collectStringLeaves(root);
			// Reverse-order edits: deeper paths first, so an outer
			// rewrite does not invalidate inner offsets.
			for (const leaf of leaves
				.slice()
				.sort((a, b) => b.path.length - a.path.length)) {
				const rewritten = rewriteIdentityInString(leaf.value);
				if (rewritten === leaf.value) continue;
				const edit = modify(working, [...leaf.path], rewritten, {
					formattingOptions: { insertSpaces: false, tabSize: 1 },
				});
				working = applyEdits(working, edit);
			}

			if (working !== text) await writeFile(absolute, working, 'utf8');
		},
	};
};
