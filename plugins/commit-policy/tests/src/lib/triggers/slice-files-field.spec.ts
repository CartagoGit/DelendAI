import { describe, expect, it } from 'vitest';

import { parseSliceFilesField } from '../../../../src/lib/triggers/slice-listener';

describe('parseSliceFilesField', () => {
	it('reads a nested list whole, without its markers', () => {
		// The shape an adopter project's x00047 used. The previous pattern
		// let whitespace cross the newline: it recorded one path,
		// "- `src/app/workstation-screen/...", and dropped the other two.
		const body = [
			'- **Status**: done',
			'- **Files**:',
			'  - `src/app/workstation-screen/workstation-screen.component.ts`',
			'  - `src/app/workstation-screen/workstation-screen.component.spec.ts`',
			'  - `src/app/route-operators-screen/route-operators-screen.component.ts`',
			'- **Gate**: `bun run validate`',
		].join('\n');
		expect(parseSliceFilesField(body)).toEqual([
			'src/app/workstation-screen/workstation-screen.component.ts',
			'src/app/workstation-screen/workstation-screen.component.spec.ts',
			'src/app/route-operators-screen/route-operators-screen.component.ts',
		]);
	});

	it('reads inline and bracketed lists', () => {
		expect(parseSliceFilesField('- **Files**: `a.ts`, `b.ts`')).toEqual([
			'a.ts',
			'b.ts',
		]);
		expect(
			parseSliceFilesField('- **Files**: [`a.ts`, `dir/b.ts`]'),
		).toEqual(['a.ts', 'dir/b.ts']);
		expect(parseSliceFilesField('* files: c.ts')).toEqual(['c.ts']);
	});

	it('never takes the next field or prose for a path', () => {
		const body = ['- **Files**:', '- **Gate**: type', 'Prose.'].join('\n');
		expect(parseSliceFilesField(body)).toEqual([]);
		expect(parseSliceFilesField('- **Files**: []')).toEqual([]);
	});
});
