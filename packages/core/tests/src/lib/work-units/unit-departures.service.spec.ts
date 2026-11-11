/**
 * What a unit changed that no slice of its proposal names.
 */
import { describe, expect, it } from 'vitest';

import {
	departuresOf,
	slicePaths,
} from '@delendai/core/lib/work-units/unit-departures.service';

const PROPOSAL = [
	'### S1',
	'- **Files**: `src/a.ts`, `src/dir/`, `lib/*.ts`',
	'### S2',
	'- **Files**: `src/b.ts`',
].join('\n');

describe('slicePaths', () => {
	it('reads the backticked paths of every Files line', () => {
		expect(slicePaths(PROPOSAL)).toEqual([
			'src/a.ts',
			'src/dir/',
			'lib/*.ts',
			'src/b.ts',
		]);
	});
});

describe('departuresOf', () => {
	it('lists the changed paths no slice names', () => {
		expect(
			departuresOf(
				['src/a.ts', 'src/dir/x.ts', 'lib/y.ts', 'src/c.ts'],
				PROPOSAL,
			),
		).toEqual(['src/c.ts']);
	});

	it('ignores proposals, generated files and specs', () => {
		expect(
			departuresOf(
				[
					'docs/delendai/proposals/in-progress/x1-a.md',
					'src/generated/tool-outputs.ts',
					'src/x.generated.ts',
					'src/c.spec.ts',
					'pkg/tests/src/c.ts',
				],
				PROPOSAL,
			),
		).toEqual([]);
	});

	it('reports nothing for a proposal that lists no files', () => {
		expect(departuresOf(['src/c.ts'], '# no slices')).toEqual([]);
	});
});
