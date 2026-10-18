/**
 * work-ref-moves.service.spec.ts — a ref taken and put back in a loop is
 * recorded, and said, with the components on each side.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IWorkRefMoveRecord } from '@delendai/core/lib/contracts/interfaces/work-ref-moves.interface';
import {
	describeLoop,
	recordWorkRefMove,
	workRefLoops,
	workRefLoopsAt,
	workRefLoopsInvariant,
	workRefMovesPathAt,
	workRefMovesPathVia,
} from '@delendai/core/lib/work-units/work-ref-moves.service';

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const clone = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'work-ref-moves-'));
	roots.push(root);
	execFileSync('git', ['init', '-q'], { cwd: root });
	return root;
};

const ref = 'delendai/wip/a/implement/x00001-all-g1/t';
const at = (minute: number): number => 1_000_000_000_000 + minute * 60_000;
const move = (
	minute: number,
	kind: IWorkRefMoveRecord['move'],
	by: string,
): IWorkRefMoveRecord => ({ at: at(minute), ref, move: kind, by });

describe('workRefLoops', () => {
	it('names a ref taken and put back more than twice, with both sides', () => {
		const moves = [0, 1, 2].flatMap((cycle) => [
			move(cycle * 10, 'withdraw', 'checkout-publisher'),
			move(cycle * 10 + 5, 'push', 'ref-maintenance'),
		]);
		const loops = workRefLoops(moves, at(60));
		expect(loops).toEqual([
			{
				ref,
				cycles: 3,
				removedBy: ['checkout-publisher'],
				restoredBy: ['ref-maintenance'],
			},
		]);
		expect(loops.map(describeLoop)[0]).toContain('put back 3 times today');
	});

	it('does not call slices landing a loop: twice is not', () => {
		const moves = [
			move(0, 'withdraw', 'p'),
			move(1, 'push', 'p'),
			move(2, 'reap', 'p'),
			move(3, 'restore', 'p'),
		];
		expect(workRefLoops(moves, at(10))).toEqual([]);
	});

	it('counts no return without a removal before it, and nothing older than a day', () => {
		const pushes = [0, 1, 2, 3].map((m) => move(m, 'push', 'p'));
		expect(workRefLoops(pushes, at(10))).toEqual([]);
		const old = [0, 1, 2].flatMap((c) => [
			move(c, 'withdraw', 'p'),
			move(c, 'push', 'q'),
		]);
		expect(workRefLoops(old, at(60 * 25))).toEqual([]);
	});
});

describe('the journal of a clone', () => {
	it('lives in the git directory, shared by its worktrees, and reads back', async () => {
		const root = clone();
		const path = workRefMovesPathAt(root);
		expect(path).toBe(
			join(root, '.git', 'delendai', 'work-ref-moves.jsonl'),
		);
		expect(
			await workRefMovesPathVia(async (args) => ({
				ok: true,
				output: execFileSync('git', [...args], {
					cwd: root,
					encoding: 'utf8',
				}),
			})),
		).toBe(path);
		const now = Date.now();
		for (const cycle of [0, 1, 2]) {
			await recordWorkRefMove(
				path,
				`refs/heads/${ref}`,
				'withdraw',
				'a',
				now - 1000 + cycle * 2,
			);
			await recordWorkRefMove(
				path,
				ref,
				'restore',
				'b',
				now - 999 + cycle * 2,
			);
		}
		expect(
			readFileSync(String(path), 'utf8').split('\n').filter(Boolean),
		).toHaveLength(6);
		expect(await workRefLoopsAt(root, now)).toHaveLength(1);
		const said = await workRefLoopsInvariant(
			root,
			Math.floor(now / 1000) + 1,
		);
		expect(said).toMatchObject({ id: 'no-work-ref-loops', holds: false });
		expect(said.observed).toContain(ref);
	});

	it('records nothing, and fails nothing, without a journal', async () => {
		await expect(
			recordWorkRefMove(undefined, ref, 'push', 'a'),
		).resolves.toBeUndefined();
		const outside = mkdtempSync(join(tmpdir(), 'no-git-'));
		roots.push(outside);
		expect(await workRefLoopsAt(outside)).toEqual([]);
		expect((await workRefLoopsInvariant(outside)).holds).toBe(true);
	});
});
