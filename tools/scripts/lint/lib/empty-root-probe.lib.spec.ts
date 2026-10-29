import { describe, expect, it } from 'vitest';

import { judgeEmptyRootRuns } from './empty-root-probe.lib';

const LINT = 'tools/scripts/lint/a.script.ts';

describe('judgeEmptyRootRuns', () => {
	it('fails a lint that passes over the empty tree unless it is allowed', () => {
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 0 }], {}),
		).toHaveLength(1);
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 0 }], {
				[LINT]: 'why',
			}),
		).toEqual([]);
	});

	it('accepts a lint that fails over the empty tree', () => {
		expect(judgeEmptyRootRuns([{ file: LINT, exitCode: 1 }], {})).toEqual(
			[],
		);
	});

	it('accepts an allowed lint that refuses, and fails an entry nothing runs', () => {
		// Refusing over the empty tree is never wrong; whether an allowed
		// lint does depends on the environment.
		expect(
			judgeEmptyRootRuns([{ file: LINT, exitCode: 1 }], {
				[LINT]: 'why',
			}),
		).toEqual([]);
		expect(judgeEmptyRootRuns([], { [LINT]: 'why' })).toHaveLength(1);
	});
});
