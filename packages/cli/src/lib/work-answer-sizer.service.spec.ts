/**
 * work-answer-sizer.service.spec.ts — a delivery whose worktree is removed
 * still emits its answer: the module is loaded before the removal.
 */
import { describe, expect, it } from 'vitest';

import { WORKTREE_ENDING_VERBS } from '../contracts/constants/worktree-ending-verbs.constant';
import { loadedOnce } from './work-answer-sizer.service';

/** A module store that fails every load once the worktree is removed. */
const worktree = () => {
	const events: string[] = [];
	let removed = false;
	return {
		events,
		remove: () => {
			removed = true;
			events.push('removed');
		},
		load: async () => {
			events.push('load');
			if (removed) throw new Error('ENOENT');
			return { sized: 'answer' };
		},
	};
};

describe('loadedOnce', () => {
	it('[<20ms] a sizer preloaded before the removal still sizes the answer after it and never loads again', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		loaded.preload();
		unit.remove();
		expect((await loaded.get()).sized).toBe('answer');
		expect(unit.events).toEqual(['load', 'removed']);
	});

	it('[<20ms] an answer without preloading loads once', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		loaded.preload();
		await loaded.get();
		await loaded.get();
		expect(unit.events).toEqual(['load']);
	});

	it('[<20ms] loads on first use without a preload', async () => {
		const unit = worktree();
		const loaded = loadedOnce(unit.load);
		expect(unit.events).toEqual([]);
		await loaded.get();
		expect(unit.events).toEqual(['load']);
	});

	it('[<20ms] a failed preload surfaces on use, not as an unhandled rejection', async () => {
		const loaded = loadedOnce(async () => {
			throw new Error('boom');
		});
		loaded.preload();
		await expect(loaded.get()).rejects.toThrow('boom');
	});
});

describe('WORKTREE_ENDING_VERBS', () => {
	it('[<20ms] names the verbs that can end a unit', () => {
		expect(WORKTREE_ENDING_VERBS).toEqual(['deliver', 'publish', 'prove']);
	});
});
