/**
 * forge-event-catch-up.spec.ts — a host that was offline tells each missed
 * fact to the sessions once, asking the forge once per reconnection.
 */

import { describe, expect, it } from 'vitest';

import {
	catchUpForgeEvents,
	forgeEventKey,
} from '@delendai/core/lib/forge-events/forge-event-catch-up.service';

import type {
	IForgeCatchUpCursor,
	IForgeCatchUpEvent as IForgeEvent,
	IForgeCatchUpSource,
	IForgeCatchUpTarget,
} from '@delendai/core/lib/contracts/interfaces/forge-catch-up.interface';

const merged: IForgeEvent = {
	kind: 'pr.merged',
	repository: 'o/r',
	number: 7,
	sha: 'abc',
};

const rig = (facts: () => readonly IForgeEvent[]) => {
	const asked: (readonly IForgeCatchUpTarget[])[] = [];
	const told: IForgeEvent[] = [];
	const memory = new Map<string, string[]>();
	const source: IForgeCatchUpSource = {
		missed: (targets) => {
			asked.push(targets);
			return Promise.resolve(facts());
		},
	};
	const cursor: IForgeCatchUpCursor = {
		delivered: (target) =>
			Promise.resolve(
				memory.get(`${target.repository}#${String(target.number)}`) ??
					[],
			),
		mark: (target, key) => {
			const id = `${target.repository}#${String(target.number)}`;
			memory.set(id, [...(memory.get(id) ?? []), key]);
			return Promise.resolve();
		},
	};
	const run = (targets: readonly IForgeCatchUpTarget[]) =>
		catchUpForgeEvents({
			source,
			cursor,
			targets: () => Promise.resolve(targets),
			deliver: (event) => {
				told.push(event);
			},
		});
	return { asked, told, run };
};

describe('catchUpForgeEvents', () => {
	it('[<10ms] delivers a missed merge once, and nothing on the next reconnect', async () => {
		const { asked, told, run } = rig(() => [merged]);
		const targets = [{ repository: 'o/r', number: 7 }];
		expect(await run(targets)).toBe(1);
		expect(await run(targets)).toBe(0);
		expect(told).toEqual([merged]);
		expect(asked).toHaveLength(2);
	});

	it('[<10ms] delivers a fact that is new since the last reconnect and not the old one', async () => {
		let facts: readonly IForgeEvent[] = [merged];
		const { told, run } = rig(() => facts);
		const targets = [{ repository: 'o/r', number: 7 }];
		await run(targets);
		facts = [
			merged,
			{
				kind: 'pr.updated',
				repository: 'o/r',
				number: 7,
				change: 'labelled',
				label: 'culprit',
				sha: 'abc',
			},
		];
		expect(await run(targets)).toBe(1);
		expect(told.map((event) => event.kind)).toEqual([
			'pr.merged',
			'pr.updated',
		]);
	});

	it('[<10ms] does not ask the forge when nobody is subscribed', async () => {
		const { asked, run } = rig(() => [merged]);
		expect(await run([])).toBe(0);
		expect(asked).toHaveLength(0);
	});

	it('[<10ms] skips an event about no pull request and a repeated fact in one answer', async () => {
		const { told, run } = rig(() => [
			{ kind: 'branch.pushed', repository: 'o/r' },
			merged,
			merged,
		]);
		expect(await run([{ repository: 'o/r', number: 7 }])).toBe(1);
		expect(told).toHaveLength(1);
	});

	it('[<5ms] keys a label by its head so a label that returns is told again', () => {
		const labelled = (sha: string): IForgeEvent => ({
			kind: 'pr.updated',
			repository: 'o/r',
			number: 1,
			change: 'labelled',
			label: 'needs-update',
			sha,
		});
		expect(forgeEventKey(labelled('a'))).not.toBe(
			forgeEventKey(labelled('b')),
		);
	});
});
