/**
 * work-deliver-remote.service.spec.ts — a delivery reports a publication
 * pushed only when the remote holds it with the unit's head.
 */
import { describe, expect, it } from 'vitest';

import { publicationOnRemote } from './work-deliver-remote.service';

const wait = { attempts: 3, pauseMs: 1 };
const input = {
	cwd: '/unit',
	branch: 'pr/implement/a/f1-S1/t',
	head: 'aaa',
	wait,
	pause: async () => undefined,
};

describe('publicationOnRemote', () => {
	it('[<20ms] is true when the remote holds the ref at the head', async () => {
		expect(
			await publicationOnRemote({ ...input, tipOf: () => 'aaa' }),
		).toBe(true);
	});

	it('[<20ms] is false when the remote never holds the ref', async () => {
		let reads = 0;
		const held = await publicationOnRemote({
			...input,
			tipOf: () => {
				reads += 1;
				return undefined;
			},
		});
		expect(held).toBe(false);
		expect(reads).toBe(3);
	});

	it('[<20ms] waits for a detached publication that lands late', async () => {
		let reads = 0;
		const held = await publicationOnRemote({
			...input,
			tipOf: () => {
				reads += 1;
				return reads < 3 ? undefined : 'aaa';
			},
		});
		expect(held).toBe(true);
	});

	it('[<20ms] reads only the ref once the unit has no head to hold', async () => {
		expect(
			await publicationOnRemote({
				...input,
				head: undefined,
				tipOf: () => 'bbb',
			}),
		).toBe(true);
	});
});
