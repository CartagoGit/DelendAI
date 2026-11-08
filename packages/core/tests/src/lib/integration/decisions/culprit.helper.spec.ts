/**
 * culprit.spec.ts — a failure is attributed from the failing zones and
 * specs against each member's footprint; with no single owner there is no
 * culprit.
 */
import { describe, expect, it } from 'vitest';

import { attributeCulprit } from '@delendai/core/lib/integration/decisions/culprit.helper';
import type { IChangeFootprint } from '@delendai/core/lib/integration/decisions/overlap.interface';

const footprint = (zones: string[], files: string[]): IChangeFootprint => ({
	zones: new Set(zones),
	files: new Set(files),
});

const members = [
	{ number: 1, own: footprint(['core'], ['core/a.ts']) },
	{ number: 2, own: footprint(['web'], ['web/b.ts']) },
	{ number: 3, own: footprint(['web'], ['web/c.ts']) },
];

describe('attributeCulprit', () => {
	it('[<20ms] names the one member that meets the failing zone', () => {
		expect(
			attributeCulprit({
				failingZones: new Set(['core']),
				failingSpecs: new Set(),
				members,
			}),
		).toEqual({ culprit: 1, suspects: [1] });
	});

	it("[<20ms] a failing spec in one member's files names that member", () => {
		expect(
			attributeCulprit({
				failingZones: new Set(['web']),
				failingSpecs: new Set(['web/c.ts']),
				members: members.slice(1),
			}).suspects,
		).toEqual([2, 3]);
	});

	it('[<20ms] with several suspects there is no culprit', () => {
		const verdict = attributeCulprit({
			failingZones: new Set(['web']),
			failingSpecs: new Set(),
			members,
		});
		expect(verdict.culprit).toBeUndefined();
		expect(verdict.suspects).toEqual([2, 3]);
	});

	it('[<20ms] a change that reaches everything is a suspect of any failure', () => {
		expect(
			attributeCulprit({
				failingZones: new Set(['core']),
				failingSpecs: new Set(),
				members: [
					{
						number: 9,
						own: { zones: 'everything', files: new Set() },
					},
				],
			}),
		).toEqual({ culprit: 9, suspects: [9] });
	});

	it('[<20ms] no failure meets no member', () => {
		expect(
			attributeCulprit({
				failingZones: new Set(),
				failingSpecs: new Set(),
				members,
			}).suspects,
		).toEqual([]);
	});
});
