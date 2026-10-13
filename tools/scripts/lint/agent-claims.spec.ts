import { describe, expect, it } from 'vitest';
import {
	checkAgentClaims,
	collectStaleClaims,
	isLockStale,
	lockStaleAfterMinutes,
} from './agent-claims.script';

const NOW = new Date('2026-06-30T10:00:00.000Z');

const freshLastSeen = (offsetMin: number) =>
	new Date(NOW.getTime() - offsetMin * 60 * 1000).toISOString();

describe('checkAgentClaims (x00080 S2 + x00088 stale-skip)', () => {
	it('returns [] when there are no modified files', () => {
		expect(checkAgentClaims([], null, { now: NOW })).toEqual([]);
	});

	it('returns all modified files when lockFileContent is null', () => {
		expect(
			checkAgentClaims(['file1.ts', 'file2.ts'], null, { now: NOW }),
		).toEqual(['file1.ts', 'file2.ts']);
	});

	it('returns all modified files when lockFileContent is corrupt JSON', () => {
		expect(
			checkAgentClaims(['file1.ts'], '{invalid', { now: NOW }),
		).toEqual(['file1.ts']);
	});

	it('returns [] when every modified file is claimed under a fresh lock', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'x00079',
					agent: 'antigravity',
					ownership: ['file1.ts', 'file2.ts'],
					last_seen: freshLastSeen(2),
				},
				{
					task_id: 'f00065',
					agent: 'copilot',
					ownership: ['file3.ts'],
					last_seen: freshLastSeen(1),
				},
			],
		});
		expect(
			checkAgentClaims(['file1.ts', 'file3.ts'], lockContent, {
				now: NOW,
			}),
		).toEqual([]);
	});

	it('returns only the unclaimed files if some modified files lack a lock', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'x00079',
					agent: 'antigravity',
					ownership: ['file1.ts'],
					last_seen: freshLastSeen(2),
				},
			],
		});
		expect(
			checkAgentClaims(
				['file1.ts', 'file2.ts', 'file3.ts'],
				lockContent,
				{ now: NOW },
			),
		).toEqual(['file2.ts', 'file3.ts']);
	});

	// x00088 — staleness should NOT block.
	it('treats stale claims as non-coverage (the file is reported as unclaimed)', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'f00103-init-default-command',
					agent: 'github-copilot@local',
					ownership: [
						'packages/cli/src/commands/init/init-default.command.ts',
					],
					last_seen: freshLastSeen(120), // 2h old
				},
			],
		});
		expect(
			checkAgentClaims(
				['packages/cli/src/commands/init/init-default.command.ts'],
				lockContent,
				{ now: NOW },
			),
		).toEqual(['packages/cli/src/commands/init/init-default.command.ts']);
	});

	it('respects the lock-file-level stale_after_minutes override', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 60, // very forgiving
			in_flight: [
				{
					task_id: 'x',
					agent: 'antigravity',
					ownership: ['file1.ts'],
					last_seen: freshLastSeen(30), // fresh under 60m
				},
			],
		});
		// 30m < 60m → claim still protects file1.ts
		expect(
			checkAgentClaims(['file1.ts'], lockContent, { now: NOW }),
		).toEqual([]);
	});

	it('treats entries with no last_seen as fresh (conservative)', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'legacy',
					agent: 'old',
					ownership: ['file1.ts'],
					// no last_seen
				},
			],
		});
		expect(
			checkAgentClaims(['file1.ts'], lockContent, { now: NOW }),
		).toEqual([]);
	});
});

describe('isLockStale (x00088)', () => {
	const entry = (lastSeen: string) => ({ last_seen: lastSeen });

	it('returns false when last_seen is missing', () => {
		expect(isLockStale(entry('') as never, NOW, 10)).toBe(false);
	});

	it('returns false when last_seen is unparseable', () => {
		expect(isLockStale(entry('not-a-date') as never, NOW, 10)).toBe(false);
	});

	it('returns false when age is below the threshold', () => {
		expect(isLockStale(entry(freshLastSeen(5)) as never, NOW, 10)).toBe(
			false,
		);
	});

	it('returns true when age is above the threshold', () => {
		expect(isLockStale(entry(freshLastSeen(15)) as never, NOW, 10)).toBe(
			true,
		);
	});

	it('returns false at exactly the threshold (boundary is strict >)', () => {
		expect(isLockStale(entry(freshLastSeen(10)) as never, NOW, 10)).toBe(
			false,
		);
	});
});

describe('lockStaleAfterMinutes (x00088)', () => {
	it('returns the override when present', () => {
		expect(lockStaleAfterMinutes({ stale_after_minutes: 45 })).toBe(45);
	});

	it('falls back to 10 when absent', () => {
		expect(lockStaleAfterMinutes({})).toBe(10);
	});
});

describe('collectStaleClaims (x00088)', () => {
	it('returns entries with last_seen older than stale_after_minutes', () => {
		const lockContent = JSON.stringify({
			stale_after_minutes: 10,
			in_flight: [
				{
					task_id: 'fresh',
					agent: 'a',
					ownership: [],
					last_seen: freshLastSeen(2),
				},
				{
					task_id: 'stale1',
					agent: 'b',
					ownership: [],
					last_seen: freshLastSeen(120),
				},
				{
					task_id: 'stale2',
					agent: 'c',
					ownership: [],
					last_seen: freshLastSeen(11),
				},
			],
		});
		const stale = collectStaleClaims(lockContent, { now: NOW });
		expect(stale.map((e) => e.task_id).sort()).toEqual([
			'stale1',
			'stale2',
		]);
	});

	it('returns [] when lockFileContent is null', () => {
		expect(collectStaleClaims(null, { now: NOW })).toEqual([]);
	});
});
