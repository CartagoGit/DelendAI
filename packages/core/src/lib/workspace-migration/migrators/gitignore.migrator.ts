/**
 * gitignore.migrator.ts — an ignore line naming a renamed path names the
 * new one.
 *
 * The cache and docs directories move to the product's name, and the
 * `.gitignore` of a project that upgraded kept `.cache/mcp-vertex/`: the
 * old directory was gone and the new one, never ignored, showed up in
 * `git status` as a tree of untracked files. Each such line is rewritten
 * to the new path; one whose new spelling the file already has is
 * dropped instead, so no line is there twice. Every other line, comments
 * and order included, is left as it was.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	IMigration,
	IMigrationContext,
	IMigrationPlanStep,
} from '../../contracts/interfaces/workspace-migration.interface';
import {
	DEFAULT_CACHE_AND_DOCS_RENAMES,
	type ICacheAndDocsRename,
} from './cache-and-docs.migrator';
import { GITIGNORE_FILE, GITIGNORE_MIGRATOR_ID } from './gitignore.constant';

/** `line` with a renamed path rewritten, or `undefined` when it names none. */
const renamedLine = (
	line: string,
	renames: readonly ICacheAndDocsRename[],
): string | undefined => {
	const negated = line.startsWith('!') ? '!' : '';
	const body = line.slice(negated.length);
	const rooted = body.startsWith('/') ? '/' : '';
	const path = body.slice(rooted.length);
	for (const { from, to } of renames) {
		if (path === from || path.startsWith(`${from}/`)) {
			return `${negated}${rooted}${to}${path.slice(from.length)}`;
		}
	}
	return undefined;
};

/** The ignore file with every renamed path rewritten, and what changed. */
export const rewriteIgnoreLines = (
	content: string,
	renames: readonly ICacheAndDocsRename[] = DEFAULT_CACHE_AND_DOCS_RENAMES,
): {
	readonly content: string;
	readonly changes: readonly { readonly from: string; readonly to: string }[];
} => {
	const lines = content.split('\n');
	const present = new Set(lines.map((line) => line.trim()));
	const changes: { from: string; to: string }[] = [];
	const kept = lines.flatMap((line) => {
		const renamed = renamedLine(line.trim(), renames);
		if (renamed === undefined) return [line];
		changes.push({ from: line.trim(), to: renamed });
		if (present.has(renamed)) return [];
		present.add(renamed);
		return [renamed];
	});
	return { content: kept.join('\n'), changes };
};

const read = (ctx: IMigrationContext): Promise<string | undefined> =>
	readFile(join(ctx.workspaceRoot, GITIGNORE_FILE), 'utf8').catch(
		() => undefined,
	);

const stepsFor = async (
	ctx: IMigrationContext,
): Promise<IMigrationPlanStep[]> => {
	const content = await read(ctx);
	if (content === undefined) return [];
	return rewriteIgnoreLines(content).changes.map((change) => ({
		kind: 'rewrite',
		detail: `${GITIGNORE_FILE}: ${change.from} → ${change.to}`,
	}));
};

export const createGitignoreMigrator = (): IMigration => ({
	id: GITIGNORE_MIGRATOR_ID,
	detect: async (ctx) => (await stepsFor(ctx)).length > 0,
	plan: stepsFor,
	apply: async (ctx) => {
		if (ctx.dryRun) return;
		const content = await read(ctx);
		if (content === undefined) return;
		const rewritten = rewriteIgnoreLines(content);
		if (rewritten.changes.length === 0) return;
		await writeFile(
			join(ctx.workspaceRoot, GITIGNORE_FILE),
			rewritten.content,
			'utf8',
		);
	},
});
