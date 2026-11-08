import { describe, expect, it } from 'vitest';

import {
	failedZonesOf,
	passedZonesOf,
	redZonesLine,
	redZonesOf,
	sectionHold,
	withRedZones,
	zoneOfCheck,
	zonesStillRed,
} from './section-health';

const check = (name: string, conclusion: string | null) => ({
	name,
	conclusion,
});

describe('the zones a run reports', () => {
	it('reads the zone of a shard, a readers job and nothing else', () => {
		expect(zoneOfCheck('tests: core 2/4')).toBe('core');
		expect(zoneOfCheck('tests: plugins readers')).toBe('plugins');
		expect(zoneOfCheck('tests: tools')).toBe('tools');
		expect(zoneOfCheck('tests')).toBeUndefined();
		expect(zoneOfCheck('typecheck')).toBeUndefined();
	});

	it('names a zone failed by one red shard, and passed only when every shard passed', () => {
		const checks = [
			check('tests: core 1/2', 'success'),
			check('tests: core 2/2', 'failure'),
			check('tests: tools', 'success'),
			check('tests: web', null),
			check('lint-biome', 'failure'),
		];
		expect(failedZonesOf(checks)).toEqual(['core']);
		expect([...passedZonesOf(checks)]).toEqual(['tools']);
	});

	it('writes and reads the red zones of a repair', () => {
		const body = `range\n\n${redZonesLine(['core', 'tools'])}`;
		expect(redZonesOf(body)).toEqual(['core', 'tools']);
		expect(redZonesOf(withRedZones(body, ['tools']))).toEqual(['tools']);
		expect(redZonesOf(redZonesLine([]))).toEqual([]);
		expect(redZonesOf(withRedZones('range', ['web']))).toEqual(['web']);
	});
});

describe('a red zone holds only what reaches it, and not its repair', () => {
	const red = new Set(['core']);

	it('holds a candidate whose change reaches the red zone', () => {
		expect(
			sectionHold({
				red,
				zones: new Set(['core', 'tools']),
				passed: new Set(),
			}),
		).toEqual(['core']);
	});

	it('lets every other candidate land', () => {
		expect(
			sectionHold({ red, zones: new Set(['tools']), passed: new Set() }),
		).toEqual([]);
		expect(
			sectionHold({
				red: new Set(),
				zones: undefined,
				passed: new Set(),
			}),
		).toEqual([]);
	});

	it('lets the repair land: its own run of the zone passed', () => {
		expect(
			sectionHold({
				red,
				zones: new Set(['core']),
				passed: new Set(['core']),
			}),
		).toEqual([]);
	});

	it('holds a change that reaches every zone', () => {
		expect(
			sectionHold({ red, zones: undefined, passed: new Set() }),
		).toEqual(['core']);
	});

	it('clears a zone once a landed pull request ran it green', () => {
		expect(
			zonesStillRed(['core', 'tools'], [new Set(['tools']), new Set()]),
		).toEqual(['core']);
	});
});
