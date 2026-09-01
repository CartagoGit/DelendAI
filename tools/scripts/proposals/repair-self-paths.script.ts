#!/usr/bin/env bun
/**
 * Repair proposal `**Files**` entries that name the document's own
 * pre-move location.
 *
 * `proposal_transition` rewrites a moved document's self-referential
 * paths so its slice plan does not keep pointing at where it used to
 * live. That rewrite used to emit a proposals-dir-relative path
 * (`review/f00299-x.md`) while the slice-completeness gate resolves
 * `**Files**` against the repo root — so a transition left behind a
 * document the very next gate could not read, and since that gate runs
 * inside `bun run validate`, one broken document blocked EVERY other
 * proposal from closing.
 *
 * The rewrite itself is fixed. This exists because a long-running MCP
 * host keeps the plugin in memory: until it restarts, transitions still
 * go through the old code and keep producing the same breakage. Run this
 * to clear what it leaves behind.
 *
 * Usage:
 *   bun tools/scripts/proposals/repair-self-paths.script.ts [--check]
 *
 * Exit codes:
 *   0 — nothing stale (or everything repaired).
 *   1 — `--check` found stale self-paths and did not write.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const PROPOSALS_RELDIR = join('docs', 'mcp-vertex', 'proposals');

export interface ISelfPathRepair {
	readonly file: string;
	readonly from: string;
	readonly to: string;
}

const collectMarkdown = async (directory: string): Promise<string[]> => {
	const out: string[] = [];
	const entries = await readdir(directory, { withFileTypes: true }).catch(
		() => [],
	);
	for (const entry of entries) {
		const full = join(directory, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await collectMarkdown(full)));
		} else if (entry.name.endsWith('.md')) {
			out.push(full);
		}
	}
	return out;
};

/**
 * Every repo-root-relative path a proposal document could have been
 * moved from, for a document whose basename is `name`. A self-path is
 * stale exactly when it names this document under a DIFFERENT folder
 * than the one it currently occupies.
 */
export const staleSelfPathsFor = (
	text: string,
	currentRelPath: string,
): readonly string[] => {
	const name = basename(currentRelPath);
	const found = new Set<string>();
	const pattern = new RegExp(
		`${PROPOSALS_RELDIR.split('\\').join('/')}/[A-Za-z0-9._/-]*${name.replace(
			/[.*+?^${}()|[\]\\]/g,
			'\\$&',
		)}`,
		'g',
	);
	for (const match of text.matchAll(pattern)) {
		if (match[0] !== currentRelPath) found.add(match[0]);
	}
	return [...found];
};

export const repairSelfPaths = async (options: {
	readonly root?: string;
	readonly write?: boolean;
}): Promise<readonly ISelfPathRepair[]> => {
	const root = options.root ?? repoRoot();
	const repairs: ISelfPathRepair[] = [];
	for (const abs of await collectMarkdown(join(root, PROPOSALS_RELDIR))) {
		const rel = relative(root, abs).split('\\').join('/');
		const text = await readFile(abs, 'utf8').catch(() => '');
		if (text === '') continue;
		const stale = staleSelfPathsFor(text, rel);
		if (stale.length === 0) continue;
		let updated = text;
		for (const from of stale) {
			updated = updated.split(from).join(rel);
			repairs.push({ file: rel, from, to: rel });
		}
		if (options.write === true) await writeFile(abs, updated, 'utf8');
	}
	return repairs;
};

const main = async (argv: readonly string[]): Promise<number> => {
	const check = argv.includes('--check');
	const repairs = await repairSelfPaths({ write: !check });
	if (repairs.length === 0) {
		process.stdout.write(
			'✓ repair-self-paths: no proposal names a stale location for itself.\n',
		);
		return 0;
	}
	for (const repair of repairs) {
		process.stdout.write(`  ${repair.file}\n    ${repair.from}\n`);
	}
	process.stdout.write(
		check
			? `✗ repair-self-paths: ${repairs.length} stale self-path(s); re-run without --check to fix.\n`
			: `✓ repair-self-paths: repaired ${repairs.length} stale self-path(s).\n`,
	);
	return check ? 1 : 0;
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
