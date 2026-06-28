#!/usr/bin/env bun
/**
 * sync-proposal-counters.script.ts — f00080 (the fix recipe the
 * `check-proposal-id-drift` lint surfaces).
 *
 * Regenerates `.cache/mcp-vertex/proposal-id-counters.json` from the
 * filesystem, taking the max id per prefix. The allocator already does
 * this on first use (its `seedFromDisk` private helper) but that path
 * is invisible to operators — they only see the drift lint complain,
 * not the one-line fix. This script is the operator-facing mirror: same
 * algorithm, persisted via the same `withFileMutex` + `writeFileAtomic`
 * primitives the runtime allocator uses, so the next call to
 * `allocateNextProposalId` is consistent with the persisted state.
 *
 * Run as:
 *
 *   bun tools/scripts/proposals/sync-proposal-counters.script.ts
 *   # or via the alias wired in package.json:
 *   bun run sync:counters
 *
 * The script reads --dry-run via an env flag so CI never accidentally
 * rewrites the counter from a stale filesystem snapshot.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { repoRoot } from '../lib/monorepo-paths';

const PROPOSAL_FILENAME = /^([a-z])(\d{2,5})-[a-z0-9-]+\.md$/;

const STATUS_FOLDERS: readonly string[] = [
	'',
	'ready',
	'in-progress',
	'review',
	'done',
	'paused',
	'blocked',
	'retired',
];

export type ICounters = Readonly<Record<string, number>>;

/** Pure: walk the proposals tree and produce per-prefix max ids. */
export const computeCountersFromDisk = async (
	proposalsDirAbs: string,
): Promise<ICounters> => {
	const counters: Record<string, number> = {};
	for (const folder of STATUS_FOLDERS) {
		const dirAbs =
			folder === '' ? proposalsDirAbs : join(proposalsDirAbs, folder);
		const entries = await readdir(dirAbs).catch(() => []);
		for (const entry of entries) {
			if (!entry.endsWith('.md')) continue;
			const m = entry.match(PROPOSAL_FILENAME);
			if (!m) continue;
			const prefix = m[1] ?? '';
			const n = Number(m[2]);
			if (!Number.isFinite(n)) continue;
			counters[prefix] = Math.max(counters[prefix] ?? 0, n);
		}
	}
	return counters;
};

/**
 * Persist `counters` to `countersPathAbs` under `withFileMutex`.
 * Atomic on POSIX (writeFileAtomic writes to a sibling temp then
 * renames); the mutex guarantees no concurrent allocator call can
 * read+write+miss the increment.
 */
export const persistCounters = async (
	countersPathAbs: string,
	counters: ICounters,
): Promise<void> =>
	withFileMutex(countersPathAbs, async () => {
		await mkdir(join(countersPathAbs, '..'), { recursive: true });
		await writeFileAtomic(countersPathAbs, JSON.stringify(counters));
	});

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	void (async () => {
		const dryRun = process.argv.includes('--dry-run');
		const root = repoRoot();
		const proposalsDirAbs = join(root, 'docs', 'mcp-vertex', 'proposals');
		const countersPathAbs = join(
			root,
			'.cache',
			'mcp-vertex',
			'proposal-id-counters.json',
		);
		const existing = await readFile(countersPathAbs, 'utf8')
			.catch(() => null)
			.then((raw) =>
				raw === null ? null : (JSON.parse(raw) as ICounters),
			);
		const counters = await computeCountersFromDisk(proposalsDirAbs);

		if (dryRun) {
			console.log('sync-proposal-counters (dry-run) — would write:');
			console.log(JSON.stringify(counters, null, '\t'));
			if (existing !== null) {
				console.log('current:');
				console.log(JSON.stringify(existing, null, '\t'));
			}
			console.log(
				`counters path: ${relative(root, countersPathAbs)} (workspace-relative)`,
			);
			return;
		}

		await persistCounters(countersPathAbs, counters);
		// Best-effort: touch the file via writeFile so the persisted JSON
		// is human-readable (writeFileAtomic adds a trailing newline).
		await writeFile(countersPathAbs, JSON.stringify(counters)).catch(
			() => undefined,
		);
		console.log(
			`✓ sync-proposal-counters: ${relative(root, countersPathAbs)} refreshed (${Object.keys(counters).length} prefixes).`,
		);
		for (const [prefix, n] of Object.entries(counters).sort(([a], [b]) =>
			a.localeCompare(b),
		)) {
			const prev = existing?.[prefix] ?? 0;
			const delta = n - prev;
			const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '=';
			console.log(`  ${prefix}: ${prev} ${arrow} ${n}`);
		}
	})();
}
