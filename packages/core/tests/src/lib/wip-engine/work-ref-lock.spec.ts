/**
 * work-ref-lock.spec.ts — the two writers of a work ref's remote copy
 * exclude each other through one file in the git common directory.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	holdWorkRef,
	workRefLockPath,
} from '../../../../src/lib/wip-engine/work-ref-lock';

const REF = 'refs/heads/delendai/wip/agent/x1-S1-g1/topic';

describe('holding a work ref', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'work-ref-lock-'));
	});
	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('names one lock for both spellings of a ref, inside the git directory', () => {
		const qualified = workRefLockPath(dir, REF);
		expect(workRefLockPath(dir, REF.replace('refs/heads/', ''))).toBe(
			qualified,
		);
		expect(qualified.startsWith(join(dir, 'delendai'))).toBe(true);
		expect(workRefLockPath(dir, `${REF}-other`)).not.toBe(qualified);
	});

	it('lets one holder in and names it to the next', async () => {
		const first = await holdWorkRef({
			gitCommonDir: dir,
			ref: REF,
			machineId: 'box',
			pid: 7,
		});
		expect(first.kind).toBe('acquired');

		expect(
			await holdWorkRef({ gitCommonDir: dir, ref: REF.slice(11) }),
		).toEqual({ kind: 'busy', holder: 'box#7' });

		if (first.kind === 'acquired') await first.release();
		expect((await holdWorkRef({ gitCommonDir: dir, ref: REF })).kind).toBe(
			'acquired',
		);
	});

	it('does not make one ref wait for another', async () => {
		expect((await holdWorkRef({ gitCommonDir: dir, ref: REF })).kind).toBe(
			'acquired',
		);
		expect(
			(await holdWorkRef({ gitCommonDir: dir, ref: `${REF}-other` }))
				.kind,
		).toBe('acquired');
	});

	it('takes over a lock whose holder died long ago', async () => {
		let now = 1_000;
		const clock = () => now;
		expect(
			(await holdWorkRef({ gitCommonDir: dir, ref: REF, now: clock }))
				.kind,
		).toBe('acquired');
		now += 600_001;
		expect(
			(await holdWorkRef({ gitCommonDir: dir, ref: REF, now: clock }))
				.kind,
		).toBe('acquired');
	});
});
