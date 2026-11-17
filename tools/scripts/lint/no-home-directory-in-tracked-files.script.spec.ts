/**
 * no-home-directory-in-tracked-files.script.spec.ts — somebody's machine
 * does not ship with the repository.
 */
import { describe, expect, it } from 'vitest';

import {
	findHomePaths,
	homePathsIn,
	isHistorical,
} from './no-home-directory-in-tracked-files.script';

describe('no-home-directory-in-tracked-files (x00586)', () => {
	it('finds the shape that actually shipped', () => {
		// The two live ones: an editor setting naming the author's
		// checkout, and rules linking every document on their disk.
		expect(
			homePathsIn(
				'"additionalDirectories": ["/home/someone/_projects/x"]',
			),
		).toHaveLength(1);
		expect(
			homePathsIn(
				'[AGENTS.md](file:///home/someone/_projects/x/AGENTS.md)',
			),
		).toHaveLength(1);
	});

	it('knows the other two platforms', () => {
		expect(homePathsIn('/Users/someone/code/x')).toHaveLength(1);
		expect(homePathsIn('C:\\Users\\someone\\code')).toHaveLength(1);
	});

	it('says nothing about a path that is the same on every machine', () => {
		// A rule that fired on these would be turned off in a week.
		for (const line of [
			'#!/usr/bin/env bun',
			'/etc/hosts',
			'/tmp/scratch',
			'./relative/path',
		]) {
			expect(`${line}: ${String(homePathsIn(line).length)}`).toBe(
				`${line}: 0`,
			);
		}
	});

	it('reports the line, so the finding is actionable', () => {
		const found = homePathsIn('one\ntwo\n/home/someone/three\n');
		expect(found[0]?.line).toBe(3);
	});

	it('leaves historical prose alone', () => {
		// An audit that quotes a terminal session is a record. Rewriting it
		// would falsify what was observed, and it is installed nowhere.
		expect(isHistorical('docs/delendai/proposals/done/audits/a1.md')).toBe(
			true,
		);
		expect(isHistorical('docs/delendai/proposals/legacy/x.md')).toBe(true);
		expect(isHistorical('.claude/settings.json')).toBe(false);
		expect(isHistorical('config/external/cursor/cursorrules')).toBe(false);
	});

	it('scans live configuration and skips the record', () => {
		const findings = findHomePaths([
			{ path: '.claude/settings.json', text: '/home/someone/x' },
			{
				path: 'docs/delendai/proposals/done/audits/a1.md',
				text: '/home/someone/x',
			},
		]);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.path).toBe('.claude/settings.json');
	});
});
