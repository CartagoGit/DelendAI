import { describe, expect, it } from 'vitest';

import { REHEARSAL_GROUPING } from '../../../../src/lib/contracts/constants/rehearsal.constant';
import {
	parseGroupSpec,
	partitionScenarios,
	selectGroup,
} from '../../../../src/lib/services/rehearsal-groups.helper';

const ids = Array.from({ length: 11 }, (_, index) => `s${String(index + 1)}`);

describe('the groups of the catalogue', () => {
	it('[<10ms] cuts 11 scenarios into 4, 4 and 3 in fast mode, in order, each once', () => {
		const groups = partitionScenarios(ids, REHEARSAL_GROUPING.fast.size);
		expect(groups.map((group) => group.length)).toEqual([4, 4, 3]);
		expect(groups.flat()).toEqual(ids);
	});

	it('[<10ms] cuts 11 scenarios into 3, 3, 3 and 2 in real mode, in order, each once', () => {
		const groups = partitionScenarios(ids, REHEARSAL_GROUPING.real.size);
		expect(groups.map((group) => group.length)).toEqual([3, 3, 3, 2]);
		expect(groups.flat()).toEqual(ids);
	});

	it('[<10ms] makes no group of nothing', () => {
		expect(partitionScenarios([], 4)).toEqual([]);
	});

	it('[<10ms] plays only the ids of the group it names', () => {
		expect(selectGroup(ids, 4, { n: 3, total: 3 })).toEqual({
			scenarios: ['s9', 's10', 's11'],
		});
	});

	it('[<10ms] refuses a group out of range, saying the valid range', () => {
		for (const spec of [
			{ n: 4, total: 3 },
			{ n: 1, total: 2 },
		])
			expect(selectGroup(ids, 4, spec)).toEqual({
				error: expect.stringContaining('valid 1/3 to 3/3'),
			});
	});

	it('[<10ms] reads n/total and nothing else', () => {
		expect(parseGroupSpec('2/3')).toEqual({ n: 2, total: 3 });
		for (const bad of ['0/3', '2', '2/', 'a/b', '2/3/4'])
			expect(parseGroupSpec(bad)).toBeUndefined();
	});
});
