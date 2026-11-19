/**
 * slice-holders.service.spec.ts — a slice another agent holds is not
 * entered by accident.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type {
	IUnitStanding,
	IUnitStandingEntry,
} from '@delendai/core/lib/work-units/unit-lease.interface';
import type {
	ISwarmUnit,
	ISwarmView,
} from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
import {
	describeSliceHolders,
	holdersOfSlice as holdersWith,
} from '@delendai/core/lib/work-units/slice-holders.service';

const unit = (agent: string, subject: string, ahead = 1): ISwarmUnit => ({
	ref: `ns/wip/${agent}/${subject}`,
	agent,
	subject,
	tip: subject,
	ahead,
	behind: 0,
	paths: [],
});

const view = (
	units: readonly ISwarmUnit[],
	published: readonly ISwarmUnit[] = [],
): ISwarmView => ({
	integration: 'develop',
	units,
	published,
	publications: published.map((entry) => entry.ref),
	overlaps: [],
	relations: [],
});

const standingOf = (ref: string, standing: IUnitStanding): IUnitStandingEntry =>
	fakePartial<IUnitStandingEntry, 'ref' | 'standing'>({ ref, standing });

/** Every unit in the view holds a live lease unless the caller says otherwise. */
const holdersOfSlice = (
	input: Omit<Parameters<typeof holdersWith>[0], 'standings'> & {
		readonly standings?: readonly IUnitStandingEntry[];
	},
) =>
	holdersWith({
		standings: [...input.view.units, ...input.view.published].map((entry) =>
			standingOf(entry.ref, 'live'),
		),
		...input,
	});

const asking = {
	agent: 'me',
	kind: 'implement',
	proposal: 'x00001',
	slice: 'S1',
} as const;

describe('holdersOfSlice', () => {
	it('[<100ms] returns a unit only when its lease is live: a published unit ahead of the integration branch with a quiet lease holds nothing', () => {
		const theirs = unit('codex', 'implement/x00001-S1-g1/t');
		const published = unit('glm', 'implement/x00001-S1-g2/t', 3);
		const held = (standing: IUnitStanding) =>
			holdersOfSlice({
				...asking,
				view: view([theirs], [published]),
				standings: [
					standingOf(theirs.ref, standing),
					standingOf(published.ref, standing),
				],
			});
		expect(held('live')).toEqual([theirs, published]);
		for (const quiet of [
			'idle',
			'waiting',
			'abandoned',
			'delivered',
		] as const)
			expect(held(quiet)).toEqual([]);
	});

	it("[<100ms] leaves a slice free that only the proposal's create unit names", () => {
		const writer = unit('opus', 'create/x00001-all-g1/the-document');
		expect(holdersOfSlice({ ...asking, view: view([], [writer]) })).toEqual(
			[],
		);
		expect(
			holdersOfSlice({
				...asking,
				kind: 'create',
				view: view([], [writer]),
			}),
		).toEqual([writer]);
	});

	it('[<100ms] names another agent on the same slice, live or published', () => {
		const held = holdersOfSlice({
			...asking,
			view: view(
				[unit('codex', 'implement/x00001-S1-g1/t')],
				[unit('glm', 'implement/x00001-S1-g2/t')],
			),
		});
		expect(held.map((entry) => entry.agent)).toEqual(['codex', 'glm']);
	});

	it('[<100ms] counts a unit for the whole proposal against a slice, and a slice against it', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view([unit('codex', 'implement/x00001-all-g1/t')]),
			}),
		).toHaveLength(1);
		expect(
			holdersOfSlice({
				...asking,
				slice: 'all',
				view: view([unit('codex', 'implement/x00001-S3-g1/t')]),
			}),
		).toHaveLength(1);
	});

	it('[<100ms] leaves other slices, other proposals, landed publications and odd names alone', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view(
					[
						unit('codex', 'implement/x00001-S2-g1/t'),
						unit('codex', 'implement/x00002-S1-g1/t'),
						unit('codex', 'no-generation'),
					],
					[unit('glm', 'implement/x00001-S1-g1/t', 0)],
				),
			}),
		).toEqual([]);
	});

	it('[<100ms] neither keeps a review out nor lets a review hold a slice', () => {
		const reviewing = view([unit('codex', 'review/x00001-S1-g1/t')]);
		expect(holdersOfSlice({ ...asking, view: reviewing })).toEqual([]);
		expect(
			holdersOfSlice({
				...asking,
				kind: 'review',
				view: view([unit('codex', 'implement/x00001-S1-g1/t')]),
			}),
		).toEqual([]);
	});

	it('[<100ms] lets an agent back into a slice it holds itself', () => {
		expect(
			holdersOfSlice({
				...asking,
				view: view([
					unit('me', 'implement/x00001-S1-g1/t'),
					unit('codex', 'implement/x00001-S1-g1/t'),
				]),
			}),
		).toEqual([]);
	});

	it('[<100ms] holds nobody out of a proposal not yet written: each agent writes its own', () => {
		expect(
			holdersOfSlice({
				...asking,
				kind: 'create',
				proposal: 'new',
				slice: 'all',
				view: view(
					[unit('codex', 'create/new-all-g1/one-proposal')],
					[unit('glm', 'create/new-all-g1/another-proposal')],
				),
			}),
		).toEqual([]);
	});

	it('[<100ms] says who holds it and what can be done about it', () => {
		const lines = describeSliceHolders([
			unit('codex', 'implement/x00001-S1-g1/t'),
		]);
		expect(lines[0]).toContain(
			'codex holds it in ns/wip/codex/implement/x00001-S1-g1/t',
		);
		expect(lines.join('\n')).toContain('--alongside');
		expect(lines.join('\n')).toContain('work claim');
	});
});
