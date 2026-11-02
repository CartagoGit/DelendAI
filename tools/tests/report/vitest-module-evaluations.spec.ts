import { describe, expect, it } from 'vitest';

import { moduleEvaluationsOf } from '../../scripts/report/vitest-module-evaluations.script';

describe('moduleEvaluationsOf', () => {
	it('reads each project line of a run, colours aside', () => {
		const esc = String.fromCharCode(27);
		const output = [
			' Test Files  283 passed (283)',
			`     Import   ${esc}[30mproposals${esc}[39m  1631 modules were evaluated 175702 times · 268.99s total, 34% of tracked time`,
			'     Import   core  954 modules were evaluated 21640 times',
		].join('\n');
		expect(moduleEvaluationsOf(output)).toEqual([
			{
				project: 'proposals',
				modules: 1631,
				evaluations: 175702,
				importSeconds: 268.99,
			},
			{ project: 'core', modules: 954, evaluations: 21640 },
		]);
	});

	it('finds nothing in output without the summary', () => {
		expect(moduleEvaluationsOf('Tests  3 passed')).toEqual([]);
	});
});
