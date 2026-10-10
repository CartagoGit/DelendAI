/**
 * index-reader-stale-projection.spec.ts — a projection built from an
 * older tree of the proposals is rebuilt before it answers.
 */
import { describe, expect, it } from 'vitest';

import { resetProposalIndexFallbackNotice } from '../../../../src/lib/proposals/index-reader';
import { levelStaleProjection } from '../../../../src/lib/proposals/index-reader-stale';

const STAMPED = 'a81bc8169';
const INDEX = '/workspace/.cache/delendai/proposals/index.json';

interface IRead {
	readonly sourceCommit: string | null;
	readonly reconciledAt?: number | null;
	readonly entries: readonly string[];
}

const level = async (input: {
	readonly current: IRead;
	readonly trees: Readonly<Record<string, string | null>>;
	readonly fresh?: IRead | null;
	readonly changedSince?: number;
}) => {
	resetProposalIndexFallbackNotice();
	const calls = { rebuilt: 0, notices: [] as string[] };
	const served = await levelStaleProjection(
		INDEX,
		{
			workspaceRoot: '/workspace',
			pathExists: () => true,
			treeOf: (_root, revision) =>
				Promise.resolve(input.trees[revision] ?? null),
			changedSince: (_dirAbs, sinceMs) =>
				Promise.resolve(
					input.changedSince !== undefined &&
						input.changedSince > sinceMs,
				),
			rebuildProjection: () => {
				calls.rebuilt += 1;
				return { status: 'refreshed', lines: [] };
			},
		},
		input.current,
		(message) => {
			calls.notices.push(message);
		},
		() => Promise.resolve(input.fresh ?? null),
	);
	return { served, calls };
};

const old: IRead = { sourceCommit: STAMPED, entries: ['two in progress'] };
const fresh: IRead = {
	sourceCommit: 'b2995062d',
	entries: ['six in progress'],
};

describe('levelStaleProjection', () => {
	it('rebuilds and serves the fresh read when the proposals tree moved', async () => {
		// A pull changed the markdown; nobody called sync.
		const { served, calls } = await level({
			current: old,
			trees: { HEAD: 'tree-now', [STAMPED]: 'tree-then' },
			fresh,
		});
		expect(calls.rebuilt).toBe(1);
		expect(served).toBe(fresh);
		expect(calls.notices.join(' ')).toContain('proposals changed since');
	});

	it('serves the projection as it is when the tree is the same', async () => {
		// Commits that touch no proposal do not make it old.
		const { served, calls } = await level({
			current: old,
			trees: { HEAD: 'tree-same', [STAMPED]: 'tree-same' },
			fresh,
		});
		expect(calls.rebuilt).toBe(0);
		expect(served).toBe(old);
	});

	it('rebuilds when the stamped commit is no longer known here', async () => {
		const { served, calls } = await level({
			current: old,
			trees: { HEAD: 'tree-now' },
			fresh,
		});
		expect(calls.rebuilt).toBe(1);
		expect(served).toBe(fresh);
	});

	it('does not rebuild on what it cannot tell', async () => {
		const notARepository = await level({
			current: old,
			trees: {},
			fresh,
		});
		expect(notARepository.calls.rebuilt).toBe(0);
		const notACommit = await level({
			current: { sourceCommit: 'test', entries: [] },
			trees: { HEAD: 'tree-now' },
			fresh,
		});
		expect(notACommit.calls.rebuilt).toBe(0);
	});

	it('rebuilds once for a proposal edited on disk, committed or not', async () => {
		const stamped = { ...old, reconciledAt: 1_000 };
		const same = { HEAD: 'tree-same', [STAMPED]: 'tree-same' };
		const edited = await level({
			current: stamped,
			trees: same,
			fresh: { ...fresh, reconciledAt: 3_000 },
			changedSince: 2_000,
		});
		expect(edited.calls.rebuilt).toBe(1);
		expect(edited.calls.notices.join(' ')).toContain('edited on disk');

		// The rebuild is newer than the edit: the next read does nothing.
		const after = await level({
			current: { ...fresh, reconciledAt: 3_000 },
			trees: {
				HEAD: 'tree-same',
				[fresh.sourceCommit ?? '']: 'tree-same',
			},
			changedSince: 2_000,
		});
		expect(after.calls.rebuilt).toBe(0);
	});

	it('keeps what it had when the rebuild leaves nothing better', async () => {
		const { served } = await level({
			current: old,
			trees: { HEAD: 'tree-now', [STAMPED]: 'tree-then' },
			fresh: { sourceCommit: null, entries: [] },
		});
		expect(served).toBe(old);
	});
});
