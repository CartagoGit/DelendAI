/**
 * The proposal index every index-reader spec reads: a JSON registry in
 * memory and throwaway workspaces cleaned after each test.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach } from 'vitest';

import type { IIndexFs } from '../../../../src/lib/proposals/index-reader-fs';
import { resetProposalIndexReadStats } from '../../../../src/lib/proposals/index-read-stats';
import {
	resetProposalIndexFallbackNotice,
	type IProposalIndexEntry,
} from '../../../../src/lib/proposals/index-reader';

export const INDEX_PATH = '/fake/.cache/delendai/proposals/index.json';

export const JSON_ENTRIES: readonly IProposalIndexEntry[] = [
	{ id: 'f00535', file: 'ready/feats/f00535-cutover.md', status: 'ready' },
	{ id: 'q00022', file: 'in-progress/q00022-plan.md', status: 'in-progress' },
];

export const INDEX_JSON = JSON.stringify({
	generated_at: '2026-09-08T00:00:00.000Z',
	count: JSON_ENTRIES.length,
	proposals: JSON_ENTRIES,
});

/** In-memory `IIndexFs` that also counts reads, so a test can prove the
 *  JSON file was (or was not) consulted. */
export const fakeFs = (
	contents: string | null = INDEX_JSON,
): IIndexFs & { readonly reads: string[] } => {
	const reads: string[] = [];
	return {
		reads,
		async read(absPath: string) {
			reads.push(absPath);
			return contents;
		},
	};
};

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
	resetProposalIndexFallbackNotice();
	resetProposalIndexReadStats();
});

/** A workspace root with NO `.cache/delendai/state/proposals.sqlite`. */
export const emptyWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'f00535-idx-'));
	roots.push(root);
	return root;
};
