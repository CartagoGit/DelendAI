/**
 * proposal-readiness.spec.ts — the baseline only shrinks.
 */
import { describe, expect, it } from 'vitest';

import {
	freshFindings,
	proposalsToJudge,
	readinessKey,
	renderBaseline,
	shrinkBaseline,
} from './proposal-readiness.script';

const item = (text: string) => ({
	proposal: 'x00001',
	slice: 'S1',
	rule: 'acceptance' as const,
	text,
});

describe('the readiness baseline', () => {
	it('[<50ms] keys a finding by proposal, slice, rule and text', () => {
		expect(readinessKey(item('a  b'))).toBe('x00001::S1::acceptance::a b');
	});
	it('[<50ms] lets a baselined finding through and stops a new one', () => {
		const baseline = [readinessKey(item('old'))];
		expect(freshFindings(baseline, [item('old'), item('new')])).toEqual([
			item('new'),
		]);
	});
	it('[<50ms] shrinks to what still applies and never adds', () => {
		const baseline = [
			readinessKey(item('gone')),
			readinessKey(item('kept')),
		];
		expect(shrinkBaseline(baseline, [item('kept'), item('new')])).toEqual([
			readinessKey(item('kept')),
		]);
	});
	it('[<50ms] writes tab-indented JSON sorted by key', () => {
		expect(renderBaseline(['b', 'a'])).toBe('[\n\t"a",\n\t"b"\n]\n');
	});

	it('[<50ms] judges every proposal without a change set', () => {
		const all = new Map([
			['a.md', 'A'],
			['b.md', 'B'],
		]);
		expect(proposalsToJudge(all, undefined)).toBe(all);
	});
	it('[<50ms] judges only the proposals the change touches', () => {
		const all = new Map([
			['a.md', 'A'],
			['b.md', 'B'],
		]);
		expect([...proposalsToJudge(all, new Set(['b.md', 'x.ts']))]).toEqual([
			['b.md', 'B'],
		]);
	});
});
