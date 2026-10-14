/**
 * pack-loader.spec.ts — a framework's rules are data the project owns,
 * selected by the installed version.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IKnowledgePackRule } from '../../../../src/lib/contracts/interfaces/knowledge-pack.interface';
import {
	loadPack,
	packFileOf,
	selectRules,
} from '../../../../src/lib/packs/pack-loader.service';
import { versionInRange } from '../../../../src/lib/packs/version-range.helper';

const rule = (
	id: string,
	appliesTo: string,
	over: Partial<IKnowledgePackRule> = {},
): IKnowledgePackRule => ({
	id,
	topic: 'templates',
	statement: `statement of ${id}`,
	force: 'recommended',
	appliesTo,
	source: `https://example.test/${id}`,
	retrievedAt: '2026-09-01T00:00:00Z',
	...over,
});

describe('versionInRange', () => {
	it('holds every comparator of the range', () => {
		expect(versionInRange('17.3.2', '>=17 <19')).toBe(true);
		expect(versionInRange('19.0.0', '>=17 <19')).toBe(false);
		expect(versionInRange('16.9.9', '>=17 <19')).toBe(false);
	});

	it('reads an exact version, with or without the operator', () => {
		expect(versionInRange('17.3.2', '=17.3.2')).toBe(true);
		expect(versionInRange('17.3.2', '17.3.2')).toBe(true);
		expect(versionInRange('17.3.3', '17.3.2')).toBe(false);
	});

	it('takes the star for any version and a pre-release for its release', () => {
		expect(versionInRange('1.0.0', '*')).toBe(true);
		expect(versionInRange('17.0.0-rc.1', '>=17')).toBe(true);
	});

	it('leaves out what it cannot read rather than guess', () => {
		expect(versionInRange('17.3.2', 'latest')).toBe(false);
		expect(versionInRange('workspace:*', '>=17')).toBe(false);
		expect(versionInRange('17.3.2', '')).toBe(false);
	});
});

describe('selectRules', () => {
	const pack = {
		framework: 'angular',
		rules: [
			rule('control-flow', '>=17'),
			rule('ng-if', '<17', { force: 'supported' }),
			rule('Bad Id', '*'),
			rule('signals', '>=17', {
				pattern: { directory: 'src', suffix: '.ts', marker: 'signal(' },
			}),
		],
	};

	it('keeps the rules whose range holds the resolved version', () => {
		const selection = selectRules(pack, '17.3.2', 'pack.json');
		expect(selection.records.map((record) => record.id)).toEqual([
			'control-flow',
			'signals',
		]);
		expect(selection.records[0]?.evidence.source).toBe(
			'https://example.test/control-flow',
		);
	});

	it('names a malformed rule instead of dropping it silently', () => {
		expect(selectRules(pack, '17.3.2', 'pack.json').rejected).toEqual([
			'Bad Id: invalid id: Bad Id',
		]);
	});

	it('carries the countable pattern of a selected rule', () => {
		expect(
			Object.keys(selectRules(pack, '17.3.2', 'pack.json').patterns),
		).toEqual(['signals']);
	});
});

describe('loadPack', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'fk-pack-'));
		await mkdir(join(dir, '.delendai', 'knowledge'), { recursive: true });
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('reads the framework file the project owns', async () => {
		await writeFile(
			join(dir, '.delendai', 'knowledge', 'angular.json'),
			JSON.stringify({
				framework: 'angular',
				rules: [rule('control-flow', '*')],
			}),
		);
		const selection = await loadPack(dir, 'angular', '17.3.2');
		expect(selection?.packFile).toBe('.delendai/knowledge/angular.json');
		expect(selection?.records).toHaveLength(1);
	});

	it('answers nothing without a pack, or for one of another framework', async () => {
		expect(await loadPack(dir, 'angular', '17.3.2')).toBeUndefined();
		await writeFile(
			join(dir, '.delendai', 'knowledge', 'angular.json'),
			JSON.stringify({ framework: 'react', rules: [] }),
		);
		expect(await loadPack(dir, 'angular', '17.3.2')).toBeUndefined();
	});

	it('refuses a framework id that is not a file name', () => {
		expect(packFileOf('../etc')).toBeUndefined();
	});
});
