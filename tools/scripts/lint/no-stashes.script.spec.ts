import { describe, expect, it } from 'vitest';

import {
	classifyStash,
	classifyStashList,
	formatDanglingLefthookBackup,
	formatStashPolicyError,
	isLefthookRunning,
	parseStashList,
} from './no-stashes.script';

describe('no-stashes policy', () => {
	it('parses an empty stash list', () => {
		expect(parseStashList('')).toEqual([]);
	});

	it('parses stash references and subjects', () => {
		expect(
			parseStashList(
				'stash@{0}|lefthook auto backup\nstash@{1}|WIP on develop',
			),
		).toEqual([
			{ ref: 'stash@{0}', message: 'lefthook auto backup' },
			{ ref: 'stash@{1}', message: 'WIP on develop' },
		]);
	});

	it('parses the stash creation timestamp when git supplies it', () => {
		expect(
			parseStashList('stash@{0}|lefthook auto backup|1788390000'),
		).toEqual([
			{
				ref: 'stash@{0}',
				message: 'lefthook auto backup',
				createdAtEpochSeconds: 1788390000,
			},
		]);
	});

	it('formats an actionable policy error', () => {
		expect(
			formatStashPolicyError([
				{ ref: 'stash@{1}', message: 'WIP on develop' },
			]),
		).toContain('stash@{1}: WIP on develop');
	});
});

describe('lefthook backup classification', () => {
	it("classifies lefthook's own backup stash as transient runner state", () => {
		expect(
			classifyStash({
				ref: 'stash@{0}',
				message: 'lefthook auto backup',
			}),
		).toBe('lefthook-backup');
	});

	it('classifies a developer/agent stash as a real violation', () => {
		expect(
			classifyStash({ ref: 'stash@{0}', message: 'WIP on develop' }),
		).toBe('user');
		expect(
			classifyStash({
				ref: 'stash@{0}',
				message: 'On develop: lefthook auto backup notes',
			}),
		).toBe('user');
	});

	it('classifies a mixed list entry by entry', () => {
		expect(
			classifyStashList(
				parseStashList(
					'stash@{0}|lefthook auto backup\nstash@{1}|WIP on develop',
				),
			),
		).toEqual([
			{
				ref: 'stash@{0}',
				message: 'lefthook auto backup',
				kind: 'lefthook-backup',
			},
			{ ref: 'stash@{1}', message: 'WIP on develop', kind: 'user' },
		]);
	});

	it('spells out the recovery command for a dangling backup', () => {
		const text = formatDanglingLefthookBackup([
			{ ref: 'stash@{0}', message: 'lefthook auto backup' },
		]);
		expect(text).toContain('git stash pop');
		expect(text).toContain('stash@{0}: lefthook auto backup');
	});
});

describe('isLefthookRunning', () => {
	it('detects a live lefthook process from /proc cmdlines', () => {
		expect(
			isLefthookRunning(
				() => ['1', '42', 'self'],
				(pid) =>
					pid === '42'
						? '/repo/node_modules/lefthook-linux-x64/bin/lefthook\0run\0pre-commit\0'
						: '/usr/bin/bash\0',
			),
		).toBe(true);
	});

	it('reports no lefthook when nothing in /proc matches', () => {
		expect(
			isLefthookRunning(
				() => ['1', '42'],
				() => '/usr/bin/bash\0-c\0git commit\0',
			),
		).toBe(false);
	});

	it('assumes transient when /proc is unavailable', () => {
		expect(
			isLefthookRunning(
				() => {
					throw new Error('ENOENT');
				},
				() => '',
			),
		).toBe(true);
	});
});
