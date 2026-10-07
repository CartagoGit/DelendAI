import { describe, expect, it } from 'vitest';

import {
	CACHE_ARTIFACT_CLASSES,
	CACHE_LAYOUT_EPOCH,
	CACHE_LAYOUT_MANIFEST,
} from '@delendai/core/lib/contracts/constants/cache-layout.constant';
import {
	assertContainedRelativePath,
	assertDroppable,
	CacheLayoutError,
	findOwningArtifact,
	isContainedRelativePath,
	resolveMigrationChain,
	validateManifest,
} from '@delendai/core/lib/cache/cache-layout-migration.helper';

import type { ICacheLayoutMigration } from '@delendai/core/lib/contracts/interfaces/cache-layout.interface';

const step = (fromEpoch: number): ICacheLayoutMigration => ({
	id: `step:${fromEpoch}`,
	fromEpoch,
	toEpoch: fromEpoch + 1,
	detect: async () => false,
	plan: async () => [],
	apply: async () => undefined,
});

describe('the cache layout manifest', () => {
	it('declares the build epoch and a sound, classified artifact list', () => {
		expect(CACHE_LAYOUT_MANIFEST.epoch).toBe(CACHE_LAYOUT_EPOCH);
		expect(validateManifest(CACHE_LAYOUT_MANIFEST)).toEqual([]);
		for (const artifact of CACHE_LAYOUT_MANIFEST.artifacts)
			expect(CACHE_ARTIFACT_CLASSES).toContain(artifact.class);
	});

	it('keeps the three results plugins as records', () => {
		for (const id of ['memory', 'logs', 'usage-tracking'])
			expect(
				CACHE_LAYOUT_MANIFEST.artifacts.find((a) => a.id === id)?.class,
			).toBe('records');
	});

	it('reports duplicate ids, duplicate paths and escaping paths', () => {
		const problems = validateManifest({
			epoch: 1,
			artifacts: [
				{ id: 'a', owner: 'x', path: 'one', class: 'derived' },
				{ id: 'a', owner: 'x', path: 'one', class: 'derived' },
				{ id: 'b', owner: 'x', path: '../out', class: 'derived' },
			],
		});
		expect(problems).toEqual([
			'duplicate id a',
			'duplicate path one',
			'path not contained: ../out',
		]);
	});
});

describe('contained relative paths', () => {
	it.each(['a', 'a/b', 'results/memory'])('accepts %s', (path) => {
		expect(isContainedRelativePath(path)).toBe(true);
	});

	it.each(['', '/abs', '../x', 'a/../b', 'a/./b', 'a//b', 'a\\b', 'C:/x'])(
		'rejects %j',
		(path) => {
			expect(isContainedRelativePath(path)).toBe(false);
			expect(() => assertContainedRelativePath(path)).toThrow(
				CacheLayoutError,
			);
		},
	);
});

describe('findOwningArtifact', () => {
	it('finds the artifact that equals or contains a path', () => {
		expect(
			findOwningArtifact(
				CACHE_LAYOUT_MANIFEST,
				'results/memory/notes.json',
			)?.id,
		).toBe('memory');
		expect(
			findOwningArtifact(CACHE_LAYOUT_MANIFEST, 'results/memory')?.id,
		).toBe('memory');
	});

	it('returns nothing for a path the manifest does not know', () => {
		expect(findOwningArtifact(CACHE_LAYOUT_MANIFEST, 'plugin-x/data')).toBe(
			undefined,
		);
		expect(findOwningArtifact(CACHE_LAYOUT_MANIFEST, 'results')).toBe(
			undefined,
		);
	});
});

describe('assertDroppable', () => {
	it.each([
		'results/memory',
		'results/memory/notes.json',
		'results/logs-errors/2026-01-01.jsonl',
		'results',
		'commit-policy',
		'agents.lock.json',
	])('refuses to drop %s', (path) => {
		expect(() => assertDroppable(CACHE_LAYOUT_MANIFEST, path)).toThrow(
			/refusing to drop/,
		);
	});

	it.each([
		'proposals/index.json',
		'verify-tmp',
		'logs',
		'memory',
		'old/dir',
	])('allows dropping %s', (path) => {
		expect(() =>
			assertDroppable(CACHE_LAYOUT_MANIFEST, path),
		).not.toThrow();
	});

	it('refuses an escaping path before looking at the manifest', () => {
		expect(() => assertDroppable(CACHE_LAYOUT_MANIFEST, '../x')).toThrow(
			/not contained/,
		);
	});
});

describe('resolveMigrationChain', () => {
	const steps = [step(5), step(6), step(7)];

	it('returns nothing when the cache is already current', () => {
		expect(resolveMigrationChain(steps, 8, 8)).toEqual([]);
	});

	it('returns every step, in order, one epoch each', () => {
		expect(
			resolveMigrationChain([steps[2]!, steps[0]!, steps[1]!], 5, 8).map(
				(m) => m.id,
			),
		).toEqual(['step:5', 'step:6', 'step:7']);
	});

	it('starts from the applied epoch', () => {
		expect(resolveMigrationChain(steps, 7, 8).map((m) => m.id)).toEqual([
			'step:7',
		]);
	});

	it('names the missing step instead of skipping it', () => {
		expect(() => resolveMigrationChain([step(5), step(7)], 5, 8)).toThrow(
			'no cache layout migration 6 -> 7',
		);
	});

	it('refuses a downgrade', () => {
		expect(() => resolveMigrationChain(steps, 10, 8)).toThrow(/downgrade/);
	});

	it('refuses a step that jumps more than one epoch', () => {
		const jump: ICacheLayoutMigration = { ...step(5), toEpoch: 8 };
		expect(() => resolveMigrationChain([jump], 5, 8)).toThrow(
			/exactly one epoch/,
		);
	});

	it('refuses two steps from the same epoch', () => {
		expect(() => resolveMigrationChain([step(5), step(5)], 5, 6)).toThrow(
			/two migrations start at epoch 5/,
		);
	});
});
