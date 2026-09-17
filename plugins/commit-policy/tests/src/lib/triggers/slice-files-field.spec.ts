import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createSliceListener,
	parseSliceFilesField,
	type ITriggerEvent,
} from '../../../../src/lib/triggers/slice-listener';

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

describe('the listener reads a proposal whose index entry carries no slices', () => {
	it('emits the slice with every path of its nested Files list', async () => {
		const workspace = await mkdtemp(join(tmpdir(), 'slice-files-md-'));
		try {
			await mkdir(join(workspace, '.cache/delendai/proposals'), {
				recursive: true,
			});
			await mkdir(join(workspace, 'docs/delendai/proposals/done'), {
				recursive: true,
			});
			// The index names the file only, so the listener parses markdown.
			await writeFile(
				join(workspace, '.cache/delendai/proposals/index.json'),
				JSON.stringify({
					proposals: [
						{ id: 'x00047', file: 'done/x00047-notices.md' },
					],
				}),
			);
			await writeFile(
				join(
					workspace,
					'docs/delendai/proposals/done/x00047-notices.md',
				),
				[
					'# x00047',
					'',
					'## Slices',
					'',
					'### S1 — Remove the bootstrap call',
					'',
					'- **Status**: done',
					'- **Files**:',
					'  - `src/app/workstation-screen/workstation-screen.component.ts`',
					'  - `src/app/services/notices.service.ts`',
					'',
				].join('\n'),
			);
			const seen: ITriggerEvent[] = [];
			const listener = createSliceListener(
				workspace,
				'.cache/delendai',
				{ kind: 'slice', onStatuses: ['done'] },
				async (event) => {
					seen.push(event);
					return { ack: 'OK' };
				},
				undefined,
				'docs/delendai',
				async () => false,
			);
			await listener.check();
			listener.stop();
			expect(seen).toHaveLength(1);
			expect(seen[0]?.files?.paths).toEqual([
				'src/app/workstation-screen/workstation-screen.component.ts',
				'src/app/services/notices.service.ts',
			]);
		} finally {
			await rm(workspace, { recursive: true, force: true });
		}
	});
});
