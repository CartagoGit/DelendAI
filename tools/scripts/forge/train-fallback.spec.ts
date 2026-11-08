/**
 * train-fallback.spec.ts — a train that cannot run never blocks what can
 * land (x01051).
 */
import { describe, expect, it } from 'vitest';

import type { ITrainPorts } from './queue-order.interface';
import { landingAfterTrain, watchTrainPorts } from './train-fallback';

const ports = (over: Partial<ITrainPorts> = {}): ITrainPorts => ({
	trainAt: () => undefined,
	fullRunAt: () => 'uncertified',
	assemble: () => ({ conflicting: [] }),
	dispatch: () => true,
	land: (_sha, members) => members.map((member) => member.number),
	blame: () => undefined,
	say: () => undefined,
	...over,
});

/** What the queue does around one attempt at a train. */
const attempt = (
	over: Partial<ITrainPorts>,
	steps: (watched: ITrainPorts) => void,
) => {
	const watch = watchTrainPorts(ports(over));
	return landingAfterTrain({
		watch,
		own: new Set([7, 9]),
		run: () => {
			steps(watch.ports);
		},
	});
};

const assembleAndDispatch = (watched: ITrainPorts): void => {
	watched.assemble('train/x', []);
	watched.dispatch('train/x');
};

describe('landingAfterTrain', () => {
	it('[<5000ms] lands the accepted candidates by their own merge when the train was not pushed', () => {
		const outcome = attempt(
			{
				assemble: () => ({
					conflicting: [],
					pushFailure: 'remote: rule violations',
				}),
			},
			assembleAndDispatch,
		);
		expect([...outcome.landing]).toEqual([7, 9]);
		expect(outcome.said).toContain(
			'was not pushed: remote: rule violations',
		);
		expect(outcome.said).toContain('#7, #9');
	});

	it('[<5000ms] lands them by their own merge when the train could not be dispatched', () => {
		const outcome = attempt({ dispatch: () => false }, assembleAndDispatch);
		expect([...outcome.landing]).toEqual([7, 9]);
		expect(outcome.said).toContain('could not be dispatched');
	});

	it('[<5000ms] lands them by their own merge when assembling the train throws', () => {
		const outcome = attempt(
			{
				assemble: () => {
					throw new Error('git: not a repository');
				},
			},
			assembleAndDispatch,
		);
		expect([...outcome.landing]).toEqual([7, 9]);
		expect(outcome.said).toContain(
			'could not be assembled: git: not a repository',
		);
	});

	it('[<5000ms] lands them by their own merge when the train throws elsewhere', () => {
		const outcome = attempt({}, () => {
			throw new Error('forge unreachable');
		});
		expect([...outcome.landing]).toEqual([7, 9]);
		expect(outcome.said).toContain('the train threw: forge unreachable');
	});

	it('[<5000ms] says so when nothing is left to land either', () => {
		const watch = watchTrainPorts(ports({ dispatch: () => false }));
		const outcome = landingAfterTrain({
			watch,
			own: new Set(),
			run: () => {
				assembleAndDispatch(watch.ports);
			},
		});
		expect(outcome.landing.size).toBe(0);
		expect(outcome.said).toContain('nothing lands this pass');
	});

	it('[<5000ms] changes nothing when the train is pushed and dispatched', () => {
		const outcome = attempt({}, assembleAndDispatch);
		expect(outcome.landing.size).toBe(0);
		expect(outcome.said).toBeUndefined();
	});

	it('[<5000ms] changes nothing when the train only waits on its full run', () => {
		expect(attempt({}, () => undefined).landing.size).toBe(0);
	});

	it('[<5000ms] leaves a conflict inside the train to the train', () => {
		const outcome = attempt(
			{ assemble: () => ({ conflicting: [9] }) },
			assembleAndDispatch,
		);
		expect(outcome.landing.size).toBe(0);
	});
});
