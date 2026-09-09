/**
 * rebase.spec.ts — replaying a checkpoint onto a moved integration head.
 *
 * Two properties are worth testing and both are easy to get wrong. The
 * happy path must succeed for edits that merely LOOK overlapping (the
 * same file, different regions) — a tree-level merge alone reports those
 * as conflicts and would make recovery useless. The unhappy path must
 * come back as a RESULT naming the conflicting paths, with the ref still
 * pointing at the work it pointed at before, because a thrown error in a
 * recovery flow is indistinguishable from lost work.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	createWipEngine,
	type IWipEngine,
} from '@delendai/core/lib/wip-engine/index';

import { createWipTestRepo, headState, type IWipTestRepo } from './wip-repo';

const REF = 'refs/wip/agent-a/f1-s1-g1';

const numbered = (first: string, last: string): string =>
	[
		first,
		...Array.from({ length: 8 }, (_, i) => `const line${i} = ${i};`),
		last,
	]
		.join('\n')
		.concat('\n');

describe('rebaseWipOntoNewBase', () => {
	let repo: IWipTestRepo;
	let engine: IWipEngine;
	let oldBase: string;

	beforeEach(async () => {
		repo = createWipTestRepo();
		repo.write('src/alpha.ts', numbered('// header', '// footer'));
		repo.write('src/other.ts', 'export const other = 1;\n');
		oldBase = repo.commitAll('base');
		const created = await createWipEngine(repo.dir);
		engine = created as IWipEngine;
	});

	afterEach(() => {
		repo.cleanup();
	});

	/** Checkpoint `content` for `src/alpha.ts`, then clean the tree again. */
	const checkpointAlpha = async (content: string): Promise<string> => {
		repo.write('src/alpha.ts', content);
		const result = await engine.createOrUpdateWipRef({
			baseSha: oldBase,
			paths: ['src/alpha.ts'],
			ref: REF,
			message: 'wip: agent a',
		});
		expect(result.status).toBe('created');
		repo.write('src/alpha.ts', numbered('// header', '// footer'));
		return result.commit;
	};

	it('replays onto a new base that touched a different file', async () => {
		const wip = await checkpointAlpha(numbered('// header', '// agent a'));
		repo.write('src/other.ts', 'export const other = 2;\n');
		const newBase = repo.commitAll('integration moves on');
		const before = headState(repo);
		const indexBefore = repo.indexBytes();

		const result = await engine.rebaseWipOntoNewBase({
			ref: REF,
			oldBase,
			newBase,
		});

		expect(result.status).toBe('rebased');
		expect(result.commit).not.toBe(wip);
		expect(repo.git('rev-parse', `${REF}^`)).toBe(newBase);
		// The replayed checkpoint carries BOTH the new base and the work.
		expect(repo.git('show', `${REF}:src/other.ts`)).toBe(
			'export const other = 2;',
		);
		expect(repo.git('show', `${REF}:src/alpha.ts`)).toContain('// agent a');
		expect(headState(repo)).toEqual(before);
		expect(repo.indexBytes().equals(indexBefore)).toBe(true);
	});

	it('replays edits to the same file in a different region', async () => {
		await checkpointAlpha(numbered('// header', '// agent a'));
		repo.write(
			'src/alpha.ts',
			numbered('// integration header', '// footer'),
		);
		const newBase = repo.commitAll('integration edits the top of the file');

		const result = await engine.rebaseWipOntoNewBase({
			ref: REF,
			oldBase,
			newBase,
		});

		expect(result.status).toBe('rebased');
		expect(result.conflicts).toEqual([]);
		const replayed = repo.git('show', `${REF}:src/alpha.ts`);
		expect(replayed).toContain('// integration header');
		expect(replayed).toContain('// agent a');
		expect(replayed).not.toContain('<<<<<<<');
	});

	it('returns a structured RECOVERY_CONFLICT instead of throwing', async () => {
		const wip = await checkpointAlpha(numbered('// header', '// agent a'));
		repo.write('src/alpha.ts', numbered('// header', '// integration'));
		const newBase = repo.commitAll('integration edits the same line');
		const before = headState(repo);

		const result = await engine.rebaseWipOntoNewBase({
			ref: REF,
			oldBase,
			newBase,
		});

		expect(result.status).toBe('RECOVERY_CONFLICT');
		expect(result.conflicts).toEqual(['src/alpha.ts']);
		expect(result.commit).toBe('');
		// Nothing was lost and nothing was auto-resolved.
		expect(repo.git('rev-parse', REF)).toBe(wip);
		expect(repo.git('show', `${REF}:src/alpha.ts`)).toContain('// agent a');
		expect(headState(repo)).toEqual(before);
		expect(repo.read('src/alpha.ts')).not.toContain('<<<<<<<');
	});

	it('reports an add/add collision as a conflict, not a merge', async () => {
		repo.write('src/added.ts', 'export const added = "agent";\n');
		const created = await engine.createOrUpdateWipRef({
			baseSha: oldBase,
			paths: ['src/added.ts'],
			ref: REF,
			message: 'wip: add a file',
		});
		expect(created.status).toBe('created');
		repo.write('src/added.ts', 'export const added = "integration";\n');
		const newBase = repo.commitAll('integration adds the same path');

		const result = await engine.rebaseWipOntoNewBase({
			ref: REF,
			oldBase,
			newBase,
		});

		expect(result.status).toBe('RECOVERY_CONFLICT');
		expect(result.conflicts).toEqual(['src/added.ts']);
	});

	it('is a no-op when the base did not move', async () => {
		const wip = await checkpointAlpha(numbered('// header', '// agent a'));

		const result = await engine.rebaseWipOntoNewBase({
			ref: REF,
			oldBase,
			newBase: oldBase,
		});

		expect(result.status).toBe('unchanged');
		expect(result.commit).toBe(wip);
		expect(repo.git('rev-parse', REF)).toBe(wip);
	});
});
