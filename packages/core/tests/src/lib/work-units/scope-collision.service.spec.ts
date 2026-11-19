/**
 * The question "is somebody already changing this" answered without a
 * repository, so every shape of it can be asked cheaply.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IUnitStanding,
	IUnitStandingEntry,
} from '@delendai/core/lib/work-units/unit-lease.interface';
import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	collisionsWith as collisionsOf,
	describeCollisions,
} from '@delendai/core/lib/work-units/scope-collision.service';

const unit = (
	agent: string,
	paths: readonly string[],
	ref = `delendai/wip/${agent}/x00001-S1-g1/its-own-work`,
): ISwarmUnit =>
	fakePartial<ISwarmUnit, 'agent' | 'ref' | 'subject' | 'paths'>({
		agent,
		ref,
		subject: 'its own work',
		paths,
	});

const standingOf = (ref: string, standing: IUnitStanding): IUnitStandingEntry =>
	fakePartial<IUnitStandingEntry, 'ref' | 'standing'>({ ref, standing });

/** Every unit given holds a live lease unless the caller says otherwise. */
const collisionsWith = (
	input: Omit<Parameters<typeof collisionsOf>[0], 'standings'> & {
		readonly standings?: readonly IUnitStandingEntry[];
	},
) =>
	collisionsOf({
		standings: input.units.map((unit) => standingOf(unit.ref, 'live')),
		...input,
	});

describe('collisionsWith (x00555 S2)', () => {
	it('[<100ms] reports only units whose lease is live', () => {
		const mine = ['src/a.ts'];
		const theirs = unit('codex', ['src/a.ts']);
		const verdict = (standing: IUnitStanding) =>
			collisionsWith({
				agent: 'me',
				scope: mine,
				units: [theirs],
				standings: [standingOf(theirs.ref, standing)],
			});
		expect(verdict('live')).toHaveLength(1);
		for (const quiet of [
			'idle',
			'waiting',
			'abandoned',
			'delivered',
		] as const)
			expect(verdict(quiet)).toEqual([]);
		expect(
			collisionsWith({
				agent: 'me',
				scope: mine,
				units: [theirs],
				standings: [],
			}),
		).toEqual([]);
	});

	it('[<100ms] names the other agent, its unit and only the shared paths', () => {
		const found = collisionsWith({
			agent: 'claude-opus-5',
			scope: ['src/a.ts', 'src/b.ts'],
			units: [unit('gpt-5', ['src/b.ts', 'src/elsewhere.ts'])],
		});
		expect(found).toHaveLength(1);
		expect(found[0]?.agent).toBe('gpt-5');
		expect(found[0]?.ref).toContain('gpt-5');
		// `src/elsewhere.ts` is theirs alone and is not the claimant's
		// business: a collision report that lists it invites a fight over
		// work that does not overlap.
		expect(found[0]?.paths).toStrictEqual(['src/b.ts']);
	});

	it('[<100ms] is silent when the same agent already holds a unit', () => {
		expect(
			collisionsWith({
				agent: 'claude-opus-5',
				scope: ['src/a.ts'],
				units: [unit('claude-opus-5', ['src/a.ts'])],
			}),
		).toStrictEqual([]);
	});

	it('[<100ms] collides when either side claims a directory the other is inside', () => {
		expect(
			collisionsWith({
				agent: 'a',
				scope: ['src/app'],
				units: [unit('b', ['src/app/main.ts'])],
			}),
		).toHaveLength(1);
		expect(
			collisionsWith({
				agent: 'a',
				scope: ['src/app/main.ts'],
				units: [unit('b', ['src/app'])],
			}),
		).toHaveLength(1);
	});

	it('[<100ms] does not mistake a shared name prefix for a shared directory', () => {
		expect(
			collisionsWith({
				agent: 'a',
				scope: ['src/app'],
				units: [unit('b', ['src/applet/main.ts'])],
			}),
		).toStrictEqual([]);
	});

	it('[<100ms] reports every colliding unit, not just the first', () => {
		expect(
			collisionsWith({
				agent: 'a',
				scope: ['src/a.ts'],
				units: [unit('b', ['src/a.ts']), unit('c', ['src/a.ts'])],
			}).map((collision) => collision.agent),
		).toStrictEqual(['b', 'c']);
	});

	it('[<100ms] offers wait, re-scope and take-over, and the command for the last', () => {
		const advice = describeCollisions(
			collisionsWith({
				agent: 'a',
				scope: ['src/a.ts'],
				units: [unit('b', ['src/a.ts'])],
			}),
		).join('\n');
		expect(advice).toContain('src/a.ts');
		expect(advice).toContain('wait');
		expect(advice).toContain('re-scope');
		expect(advice).toContain('delendai work claim --ref=');
	});
});
