#!/usr/bin/env bun
/**
 * cleanup-dup-reviews.script.ts — one-shot cleanup for the migration
 * artifact documented in commit `cd41219e` ("docs(proposals): replace
 * ready/ design docs with review/ summaries").
 *
 * The migration created `review/<proposal>.md` summaries that duplicate
 * the canonical `done/<kind>/<proposal>.md` (or `in-progress/`) version
 * of the same proposal ID. The proposal registry index refuses duplicates
 * (see `sync-proposal-registry.ts`), so the stale `review/` copies
 * surface as 26 `errorCount` lines on every `sync_proposals` invocation.
 *
 * Policy (matches the migration intent):
 *   1. If a file exists in `done/` → `done/` is canonical. Delete the
 *      matching `review/` (and any matching `in-progress/`).
 *   2. Else if a file exists in `in-progress/` → `in-progress/` is
 *      canonical. Delete the matching `review/`.
 *   3. Else if files exist in `ready/` AND `review/` → prefer the file
 *      whose frontmatter `status:` matches the folder (e.g. status: ready
 *      in ready/, status: review in review/). If they differ, delete the
 *      `review/` copy and let the operator move the ready/ copy when
 *      its implementation lands.
 *
 * Two-mode CLI:
 *   bun tools/scripts/lint/cleanup-dup-reviews.script.ts            # dry-run
 *   bun tools/scripts/lint/cleanup-dup-reviews.script.ts --apply   # perform
 */
import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	unlinkSync,
} from 'node:fs';
import { join, relative } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

const ROOT = repoRoot();
const PROPOSALS = join(ROOT, 'docs/delendai/proposals');

const FOLDER_PRIORITY = ['done', 'in-progress', 'review', 'ready'] as const;

interface IFound {
	id: string;
	paths: string[];
}

const listAllProposalIds = (): IFound[] => {
	const byId = new Map<string, string[]>();
	const walk = (folder: string) => {
		const abs = join(PROPOSALS, folder);
		if (!existsSync(abs)) return;
		const stack: string[] = [abs];
		while (stack.length > 0) {
			const dir = stack.pop();
			if (dir === undefined) break;
			for (const entry of readdirSync(dir)) {
				if (entry.startsWith('.')) continue;
				const full = join(dir, entry);
				const stat = statSync(full);
				if (stat.isDirectory()) {
					stack.push(full);
					continue;
				}
				if (!entry.endsWith('.md')) continue;
				const raw = readFileSync(full, 'utf8');
				const match = raw.match(/^id:\s*([a-z]\d{5})/m);
				if (match === null) continue;
				const id = match[1];
				if (id === undefined) continue;
				const rel = relative(ROOT, full);
				const list = byId.get(id) ?? [];
				list.push(rel);
				byId.set(id, list);
			}
		}
	};
	for (const folder of FOLDER_PRIORITY) walk(folder);
	const result: IFound[] = [];
	for (const [id, paths] of byId) {
		if (paths.length > 1) result.push({ id, paths: paths.sort() });
	}
	return result.sort((a, b) => a.id.localeCompare(b.id));
};

const pickCanonicalAndStale = (
	paths: readonly string[],
): {
	canonical: string;
	stale: string[];
} => {
	const byFolder = new Map<string, string>();
	for (const path of paths) {
		const segments = path.split('/');
		const folder = FOLDER_PRIORITY.find((f) => segments.includes(f));
		if (folder === undefined) continue;
		byFolder.set(folder, path);
	}
	for (const folder of FOLDER_PRIORITY) {
		const path = byFolder.get(folder);
		if (path !== undefined) {
			const stale: string[] = [];
			for (const other of paths) {
				if (other !== path) stale.push(other);
			}
			return { canonical: path, stale };
		}
	}
	return { canonical: '', stale: [...paths] };
};

const APPLY = process.argv.includes('--apply');

const duplicates = listAllProposalIds();
let removed = 0;
for (const dup of duplicates) {
	const { canonical, stale } = pickCanonicalAndStale(dup.paths);
	if (canonical === '') {
		console.warn(
			`WARN ${dup.id}: no canonical location found (${dup.paths.join(', ')})`,
		);
		continue;
	}
	for (const path of stale) {
		const verb = APPLY ? 'rm' : 'would-rm';
		console.log(`${verb} ${dup.id}: ${path} (canonical: ${canonical})`);
		if (APPLY) {
			unlinkSync(join(ROOT, path));
			removed += 1;
		}
	}
}

if (APPLY) {
	console.log(
		`\nRemoved ${removed} stale duplicates across ${duplicates.length} ids.`,
	);
} else {
	console.log(
		`\nDry-run: ${duplicates.length} duplicate ids; ${duplicates.reduce((acc, d) => acc + d.paths.length - 1, 0)} stale files. Pass --apply to delete.`,
	);
}
