/**
 * restore.spec.ts — restoring work back into a SHARED checkout.
 *
 * The dangerous version of this operation is `git checkout <wip-ref> --
 * <paths>`: it moves nothing visible, so it looks safe, and then it
 * writes whatever the caller asked for — including files that belong to
 * another agent who is editing them right now. These tests pin the two
 * behaviours that make it safe instead: the restore is confined to the
 * scope the checkpoint recorded for ITSELF, and a request outside that
 * scope is refused without writing anything at all.
 */

import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createWipEngine,
	type IWipEngine,
} from '@delendai/core/lib/wip-engine/index';

import {
	createWipTestRepo,
	headState,
	type IWipTestRepo,
	INTEGRATION_BRANCH,
} from './wip-repo';

const REF = 'refs/wip/agent-a/f1-s1-g1';

describe('restorePathsFromRef', () => {
	let repo: IWipTestRepo;
	let engine: IWipEngine;
	let base: string;

	beforeEach(async () => {
		repo = createWipTestRepo();
		repo.write('src/alpha.ts', 'export const alpha = 1;\n');
		repo.write('src/doomed.ts', 'export const doomed = 1;\n');
		repo.write('src/beta.ts', 'export const beta = 1;\n');
		base = repo.commitAll('base');
		const created = await createWipEngine(repo.dir, {
			required: true,
			branch: INTEGRATION_BRANCH,
		});
		engine = created as IWipEngine;

		repo.write('src/alpha.ts', 'export const alpha = 2;\n');
		repo.write('src/nested/new.ts', 'export const fresh = 1;\n');
		repo.write('src/doomed.ts', '');
		await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/alpha.ts', 'src/nested', 'src/doomed.ts'],
			ref: REF,
			message: 'wip: agent a',
		});
	});

	afterEach(() => {
		repo.cleanup();
	});

	it('restores only the requested in-scope paths and leaves HEAD alone', async () => {
		// The work is lost from the working tree, and a foreign agent has
		// meanwhile dirtied a file this ref does not own.
		repo.write('src/alpha.ts', 'export const alpha = 1;\n');
		rmSync(join(repo.dir, 'src/nested/new.ts'));
		repo.write('src/beta.ts', 'export const beta = 999;\n');
		const before = headState(repo);
		const indexBefore = repo.indexBytes();

		const result = await engine.restorePathsFromRef({
			ref: REF,
			paths: ['src/alpha.ts'],
		});

		expect(result.status).toBe('restored');
		expect(result.restored).toEqual(['src/alpha.ts']);
		expect(repo.read('src/alpha.ts')).toBe('export const alpha = 2;\n');
		// Untouched: another agent's dirty file, and the part of the ref
		// that was not asked for — a restore is not a checkout.
		expect(repo.read('src/beta.ts')).toBe('export const beta = 999;\n');
		expect(repo.read('src/nested/new.ts')).toBeUndefined();
		expect(headState(repo)).toEqual(before);
		expect(repo.indexBytes().equals(indexBefore)).toBe(true);
	});

	it('restores a whole claimed directory, creating missing files', async () => {
		repo.write('src/nested/new.ts', 'clobbered\n');

		const result = await engine.restorePathsFromRef({
			ref: REF,
			paths: ['src/nested'],
		});

		expect(result.status).toBe('restored');
		expect(result.restored).toEqual(['src/nested/new.ts']);
		expect(repo.read('src/nested/new.ts')).toBe(
			'export const fresh = 1;\n',
		);
	});

	it('refuses a path outside the ref scope and writes nothing', async () => {
		repo.write('src/beta.ts', 'export const beta = 999;\n');

		const result = await engine.restorePathsFromRef({
			ref: REF,
			paths: ['src/alpha.ts', 'src/beta.ts'],
		});

		expect(result.status).toBe('refused');
		expect(result.outOfScope).toEqual(['src/beta.ts']);
		expect(result.restored).toEqual([]);
		// Not even the in-scope half of the request was applied.
		expect(repo.read('src/beta.ts')).toBe('export const beta = 999;\n');
		expect(repo.read('src/alpha.ts')).toBe('export const alpha = 2;\n');
	});

	it('reports an unknown ref as a failure rather than throwing', async () => {
		const result = await engine.restorePathsFromRef({
			ref: 'refs/wip/agent-a/does-not-exist',
			paths: ['src/alpha.ts'],
		});

		expect(result.status).toBe('failed');
		expect(result.reason).toContain('unknown ref');
	});
});

describe('restorePathsFromRef — deletions', () => {
	let repo: IWipTestRepo;
	let engine: IWipEngine;

	afterEach(() => {
		repo.cleanup();
	});

	it('re-applies a deletion the checkpoint recorded', async () => {
		repo = createWipTestRepo();
		repo.write('src/alpha.ts', 'export const alpha = 1;\n');
		repo.write('src/gone.ts', 'export const gone = 1;\n');
		const base = repo.commitAll('base');
		const created = await createWipEngine(repo.dir, {
			required: true,
			branch: INTEGRATION_BRANCH,
		});
		engine = created as IWipEngine;

		rmSync(join(repo.dir, 'src/gone.ts'));
		const checkpoint = await engine.createOrUpdateWipRef({
			baseSha: base,
			paths: ['src/gone.ts'],
			ref: REF,
			message: 'wip: remove gone',
		});
		expect(checkpoint.status).toBe('created');

		// Somebody put the file back; restoring the checkpoint must
		// re-express the deletion, not silently keep the resurrected file.
		repo.write('src/gone.ts', 'export const gone = 1;\n');
		const result = await engine.restorePathsFromRef({
			ref: REF,
			paths: ['src/gone.ts'],
		});

		expect(result.status).toBe('restored');
		expect(result.deleted).toEqual(['src/gone.ts']);
		expect(repo.read('src/gone.ts')).toBeUndefined();
		expect(repo.read('src/alpha.ts')).toBe('export const alpha = 1;\n');
	});
});
