import { describe, expect, it } from 'vitest';

import {
	findTrackedIgnoredFiles,
	formatReport,
} from './no-tracked-ignored-files.script';

describe('findTrackedIgnoredFiles', () => {
	it('is ok when the injected lister returns nothing', () => {
		const result = findTrackedIgnoredFiles('/repo', () => []);
		expect(result.ok).toBe(true);
		expect(result.offenders).toEqual([]);
	});

	it('flags every path the lister returns, sorted', () => {
		const result = findTrackedIgnoredFiles('/repo', () => [
			'metrics-candidate.json',
			'.claude/settings.local.json',
		]);
		expect(result.ok).toBe(false);
		expect(result.offenders).toEqual([
			'.claude/settings.local.json',
			'metrics-candidate.json',
		]);
	});

	it('passes the given cwd through to the lister', () => {
		let received = '';
		findTrackedIgnoredFiles('/some/repo', (cwd) => {
			received = cwd;
			return [];
		});
		expect(received).toBe('/some/repo');
	});
});

describe('formatReport', () => {
	it('reports clean when ok', () => {
		expect(formatReport({ offenders: [], ok: true })).toContain('✓');
	});

	it('lists every offender and the fix hint when not ok', () => {
		const out = formatReport({
			offenders: ['a.local.json'],
			ok: false,
		});
		expect(out).toContain('✖');
		expect(out).toContain('a.local.json');
		expect(out).toContain('git rm --cached');
	});
});

// x00163 — this repo's OWN state used to fail this check (both
// .claude/settings.local.json and metrics-candidate.json were tracked
// despite matching .gitignore rules; both were untracked as part of
// the same fix). This test pins that the real git-backed lister
// (against THIS repo, at test time) reports clean, so the regression
// cannot silently reappear.
describe('acceptance: this repo is clean against its own real git state', () => {
	it('gitListTrackedIgnoredFiles reports 0 offenders for the live repo', async () => {
		const { gitListTrackedIgnoredFiles } = await import(
			'./no-tracked-ignored-files.script'
		);
		const result = findTrackedIgnoredFiles(
			process.cwd(),
			gitListTrackedIgnoredFiles,
		);
		expect(result.offenders).toEqual([]);
	});
});
