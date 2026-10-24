/**
 * dependency-advisories.script.spec.ts — what blocks, what an exception
 * waives, and when the waiver runs out.
 */
import { describe, expect, it } from 'vitest';

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	askFloors,
	declaredFloors,
	floorAdvisories,
	judgeAdvisories,
	publishableManifests,
	rangeFloor,
} from './dependency-advisories.script';

const advisory = (severity: string, id = 'GHSA-aaaa-bbbb-cccc') => ({
	url: `https://github.com/advisories/${id}`,
	title: 'a flaw',
	severity,
});
const exception = (until: string) => ({
	advisory: 'GHSA-aaaa-bbbb-cccc',
	package: 'braces',
	reason: 'no patched version',
	until,
});

describe('judgeAdvisories', () => {
	it('blocks an advisory of every severity, low included', () => {
		// The forge lists low alerts on the release branch too.
		for (const severity of ['low', 'moderate', 'high', 'critical']) {
			expect(
				judgeAdvisories(
					{ hono: [advisory(severity)] },
					[],
					'2026-10-07',
				).toFix,
			).toHaveLength(1);
		}
	});

	it('waives an advisory excepted for that package until a later date', () => {
		const verdict = judgeAdvisories(
			{ braces: [advisory('high')] },
			[exception('2026-11-07')],
			'2026-10-07',
		);
		expect(verdict.toFix).toEqual([]);
		expect(verdict.excepted).toHaveLength(1);
	});

	it('fails an exception once its date has passed', () => {
		expect(
			judgeAdvisories(
				{ braces: [advisory('high')] },
				[exception('2026-10-01')],
				'2026-10-07',
			).expired,
		).toHaveLength(1);
	});

	it('does not stretch an exception to another package', () => {
		expect(
			judgeAdvisories(
				{ micromatch: [advisory('high')] },
				[exception('2026-11-07')],
				'2026-10-07',
			).toFix,
		).toHaveLength(1);
	});
});

describe('the floor of a published range', () => {
	it('is the lowest version the range admits', () => {
		expect(rangeFloor('^1.31.0')).toBe('1.31.0');
		expect(rangeFloor('>=1.40.0')).toBe('1.40.0');
		expect(rangeFloor('>=1.2.0 <2.0.0')).toBe('1.2.0');
		expect(rangeFloor('^2.0.0 || ^1.9.3')).toBe('1.9.3');
		expect(rangeFloor('latest')).toBeUndefined();
	});

	it('is asked about for every published range but a workspace one', () => {
		const floors = declaredFloors([
			{
				path: 'plugins/a/package.json',
				json: {
					dependencies: { sdk: '^1.31.0', sibling: 'workspace:*' },
					peerDependencies: { pw: '>=1.40.0' },
				},
			},
			{
				path: 'plugins/b/package.json',
				json: { private: true, dependencies: { sdk: '^1.0.0' } },
			},
		]);
		expect(floors).toEqual([
			{
				name: 'sdk',
				range: '^1.31.0',
				floor: '1.31.0',
				manifest: 'plugins/a/package.json',
			},
			{
				name: 'pw',
				range: '>=1.40.0',
				floor: '1.40.0',
				manifest: 'plugins/a/package.json',
			},
		]);
	});

	it('fails a floor inside an advisory and names the range and the version that clears it', () => {
		const floors = declaredFloors([
			{
				path: 'plugins/a/package.json',
				json: { dependencies: { sdk: '^1.31.0', clean: '^2.0.0' } },
			},
		]);
		const found = floorAdvisories(floors, {
			sdk: [
				{
					url: 'https://github.com/advisories/GHSA-x',
					title: 'leak',
					severity: 'high',
					vulnerable_versions: '>=1.24.0 <1.32.0',
				},
			],
			clean: [
				{
					url: 'https://github.com/advisories/GHSA-y',
					title: 'old',
					severity: 'low',
					vulnerable_versions: '<1.0.0',
				},
			],
		});
		expect(Object.keys(found)).toEqual(['sdk']);
		expect(found.sdk?.[0]?.title).toBe(
			'leak — "^1.31.0" in plugins/a/package.json admits 1.31.0; it clears at 1.32.0',
		);
	});
});

describe('asking about the floors', () => {
	it('sends each package its floor versions once, and reads the answer', async () => {
		let sent: unknown;
		const answer = await askFloors(
			[
				{
					name: 'sdk',
					range: '^1.31.0',
					floor: '1.31.0',
					manifest: 'a',
				},
				{
					name: 'sdk',
					range: '^1.31.0',
					floor: '1.31.0',
					manifest: 'b',
				},
			],
			async (_url, init) => {
				sent = JSON.parse(String(init?.body));
				return new Response(JSON.stringify({ sdk: [] }));
			},
		);
		expect(sent).toEqual({ sdk: ['1.31.0'] });
		expect(answer).toEqual({ sdk: [] });
	});

	it('fails when the database does not answer', async () => {
		await expect(
			askFloors([], async () => new Response('', { status: 503 })),
		).rejects.toThrow('answered 503');
	});

	it('reads the manifests under packages/ and plugins/, skipping one that is not JSON', () => {
		const root = mkdtempSync(join(tmpdir(), 'floors-'));
		for (const dir of ['packages/a', 'plugins/b', 'plugins/c'])
			mkdirSync(join(root, dir), { recursive: true });
		writeFileSync(join(root, 'packages/a/package.json'), '{"name":"a"}');
		writeFileSync(join(root, 'plugins/b/package.json'), 'not json');
		expect(publishableManifests(root)).toEqual([
			{ path: 'packages/a/package.json', json: { name: 'a' } },
		]);
	});
});
