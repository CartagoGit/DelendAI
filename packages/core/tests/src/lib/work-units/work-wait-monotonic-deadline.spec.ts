/**
 * work-wait-monotonic-deadline.spec.ts — the work-ref hold wait (publish)
 * and the enter wait decide their deadline on the monotonic clock, so a
 * wall-clock step is not a refusal (x01126). The lock is a fake, the
 * clock is a fake, and no real timer runs.
 */
import {
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';

import { createGitRepoTemplate, fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';

type IHeld =
	| { readonly kind: 'acquired'; readonly release: () => Promise<void> }
	| { readonly kind: 'busy'; readonly holder: string };

const lock = vi.hoisted(() => ({
	holdWorkRef: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@delendai/core/lib/wip-engine/work-ref-lock', async (original) => ({
	...(await original<Record<string, unknown>>()),
	holdWorkRef: lock.holdWorkRef,
}));

const { withWorkRefHeld } = await import(
	'@delendai/core/lib/work-units/work-publish.service'
);
const { enteredLocked } = await import(
	'@delendai/core/lib/work-units/work-unit-enter.service'
);

const WALL_STEP_MS = 5_600;
const ENTER_WALL_STEP_MS = 61_000;

const busy: IHeld = { kind: 'busy', holder: 'someone-else' };
const acquired: IHeld = { kind: 'acquired', release: async () => undefined };

describe('work waits are decided on the monotonic clock (x01126)', () => {
	let root: string;
	let wall: number;
	let mono: number;

	beforeAll(() => {
		root = createGitRepoTemplate({
			trunk: 'develop',
			files: { '.gitignore': '.cache/\n' },
		}).copy().root;
	});

	beforeEach(() => {
		wall = 1_700_000_000_000;
		mono = 1_000;
		lock.holdWorkRef.mockReset();
		vi.useFakeTimers({ toFake: ['setTimeout'] });
		vi.spyOn(Date, 'now').mockImplementation(() => wall);
		vi.spyOn(performance, 'now').mockImplementation(() => mono);
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	/** Busy for `busyPolls` attempts (stepping the clocks), then free. */
	const busyThen = (
		busyPolls: number,
		wallStep: number,
		monoStep: number,
	): (() => Promise<IHeld>) => {
		let polls = 0;
		return async () => {
			polls += 1;
			wall += wallStep;
			mono += monoStep;
			return polls <= busyPolls ? busy : acquired;
		};
	};

	describe('the publish hold wait', () => {
		it('[<200ms] keeps waiting through a wall-clock step of 5.6 s', async () => {
			const hold = vi.fn(busyThen(3, WALL_STEP_MS, 2));
			const run = withWorkRefHeld(root, 'wip/a', async () => 'body', {
				hold,
				pollMs: 100,
				waitMs: 1_000,
			});
			await vi.advanceTimersByTimeAsync(1_000);
			const outcome = await run;
			expect(outcome.held).toBe(true);
			expect(hold).toHaveBeenCalledTimes(4);
		});

		it('[<200ms] refuses once monotonic time passes waitMs, with the wall clock still', async () => {
			const hold = vi.fn(busyThen(Number.POSITIVE_INFINITY, 0, 400));
			const run = withWorkRefHeld(root, 'wip/a', async () => 'body', {
				hold,
				pollMs: 100,
				waitMs: 1_000,
			});
			await vi.advanceTimersByTimeAsync(1_000);
			const outcome = await run;
			expect(outcome.held).toBe(false);
			expect(outcome.detail).toContain('someone-else');
		});
	});

	describe('the enter wait', () => {
		const ctx = (): IWorkUnitContext =>
			fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
				cwd: root,
				globals: fakePartial<
					IWorkUnitContext['globals'],
					'workspace' | 'json'
				>({ workspace: root, json: true }),
			});

		it('[<200ms] keeps waiting through a wall-clock step past the whole enter wait', async () => {
			lock.holdWorkRef.mockImplementation(
				busyThen(3, ENTER_WALL_STEP_MS, 2),
			);
			const run = enteredLocked('u/x/y/z', ['enter'], ctx());
			await vi.advanceTimersByTimeAsync(2_000);
			const outcome = await run;
			expect(JSON.stringify(outcome)).not.toContain('still entering');
			expect(lock.holdWorkRef.mock.calls.length).toBeGreaterThan(3);
		});

		it('[<200ms] refuses once monotonic time passes the enter wait, with the wall clock still', async () => {
			lock.holdWorkRef.mockImplementation(
				busyThen(Number.POSITIVE_INFINITY, 0, 30_000),
			);
			const run = enteredLocked('u/x/y/z', ['enter'], ctx());
			await vi.advanceTimersByTimeAsync(2_000);
			const outcome = await run;
			expect(JSON.stringify(outcome)).toContain('still entering');
		});
	});
});
