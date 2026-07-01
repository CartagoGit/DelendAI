import { describe, expect, it } from 'vitest';

import type {
	IGitRunner,
	IGitRunResult,
} from '@mcp-vertex/proposals/lib/shared/git-runner';
import { runStashSnapshot } from '@mcp-vertex/proposals/lib/shared/stash-snapshot';

const ok = (output: string): IGitRunResult => ({ ok: true, output });
const fail = (reason: string): IGitRunResult => ({
	ok: false,
	output: '',
	reason,
});

const stubRunner =
	(response: IGitRunResult): IGitRunner =>
	(args) => {
		// Spot-check the invariant: the engine must invoke
		// `git stash list` with the custom --format so we never
		// regress to the default `stash@{0}: WIP on ...` string.
		expect(args).toContain('stash');
		expect(args).toContain('list');
		expect(args.join(' ')).toContain('--format=%gd|%gs|%gD');
		return Promise.resolve(response);
	};

describe('runStashSnapshot (f00075 S4)', () => {
	it('returns an empty list when git reports no stashes', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(ok('')),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toEqual([]);
	});

	it('returns an empty list when git fails (fail-soft contract)', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(fail('not a git repository')),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toEqual([]);
	});

	it('parses one stash entry (clean branch + ISO date)', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(
				ok(
					'stash@{0}|develop: WIP on refactor|2026-06-28T10:15:30+02:00',
				),
			),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			index: 0,
			ref: 'stash@{0}',
			branch: 'develop',
			message: 'WIP on refactor',
			date: '2026-06-28T10:15:30+02:00',
		});
	});

	it('parses multi-stash output (different branches, oldest first)', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(
				ok(
					[
						'stash@{0}|feature/swarm-hygiene: S4 stash|2026-06-28T11:00:00+02:00',
						'stash@{1}|develop: half-cherry-pick of rescue|2026-06-27T22:30:00+02:00',
						'stash@{2}|agent/copilot-minimax-m3-s57: f00057 S11 redo|2026-06-27T18:45:00+02:00',
					].join('\n'),
				),
			),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toHaveLength(3);
		expect(entries[0]).toEqual({
			index: 0,
			ref: 'stash@{0}',
			branch: 'feature/swarm-hygiene',
			message: 'S4 stash',
			date: '2026-06-28T11:00:00+02:00',
		});
		expect(entries[1]?.branch).toBe('develop');
		expect(entries[1]?.message).toBe('half-cherry-pick of rescue');
		expect(entries[2]?.branch).toBe('agent/copilot-minimax-m3-s57');
		// Indexes are parsed back from the ref, not the line order —
		// proves the consumer can rely on them for `stash@{N}` refs.
		expect(entries.map((e) => e.index)).toEqual([0, 1, 2]);
	});

	it('keeps branch as null for detached-HEAD stashes (git omits the prefix)', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(ok('stash@{0}|WIP on 8d3a9c1: index tweak|')),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]?.branch).toBeNull();
		expect(entries[0]?.message).toBe('WIP on 8d3a9c1: index tweak');
		expect(entries[0]?.date).toBeNull();
	});

	it('preserves colons inside the message verbatim (first colon is the branch separator)', async () => {
		const entries = await runStashSnapshot({
			run: stubRunner(
				ok(
					'stash@{0}|develop: backup before merge: feat one|2026-06-28T13:00:00+02:00',
				),
			),
			workspaceRoot: '/tmp/whatever',
		});
		expect(entries).toHaveLength(1);
		// The subject is parsed up to the FIRST colon as the branch,
		// the remainder is the message — internal colons survive.
		expect(entries[0]?.branch).toBe('develop');
		expect(entries[0]?.message).toBe('backup before merge: feat one');
		expect(entries[0]?.date).toBe('2026-06-28T13:00:00+02:00');
	});

	it('honors the maxEntries cap (drops excess without erroring)', async () => {
		const wellFormed = Array.from(
			{ length: 5 },
			(_, i) =>
				`stash@{${i}}|develop: WIP on entry ${i}|2026-06-28T12:00:00+02:00`,
		).join('\n');
		const entries = await runStashSnapshot({
			run: stubRunner(ok(wellFormed)),
			workspaceRoot: '/tmp/whatever',
			maxEntries: 2,
		});
		expect(entries).toHaveLength(2);
		expect(entries.map((e) => e.index)).toEqual([0, 1]);
	});
});
