/**
 * A Files entry written new:<path> says the slice creates the file. Until
 * the work is delivered the file may be absent; once delivered it may not.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	isDelivered,
	scanMissingFiles,
	sliceOfBlock,
} from './proposal-files-exist.script';

let root = '';
beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'files-exist-'));
});
afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const seed = (folder: string, sliceStatus: string, files: string): void => {
	const dir = join(root, 'docs/delendai/proposals', folder);
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'x00001-t.md'),
		[
			'---',
			'id: x00001',
			'---',
			'',
			'### S1 — t',
			...(sliceStatus === '' ? [] : [`- **Status**: ${sliceStatus}`]),
			`- **Files**: ${files}`,
			'- **Gate**: none',
			'',
		].join('\n'),
	);
};

const missing = (): string[] => Object.values(scanMissingFiles(root)).flat();

describe('which work is delivered', () => {
	it('[<50ms] takes the slice status first, then the folder', () => {
		expect(isDelivered('done', 'in-progress')).toBe(true);
		expect(isDelivered('review', 'in-progress')).toBe(true);
		expect(isDelivered('in-progress', 'review')).toBe(false);
		expect(isDelivered(undefined, 'review')).toBe(true);
		expect(isDelivered(undefined, 'done')).toBe(true);
		expect(isDelivered(undefined, 'in-progress')).toBe(false);
	});
	it('[<50ms] reads the slice a block sits in', () => {
		const text = '### S2 — t\n- **Status**: done\n- **Files**: `a/b.ts`';
		expect(sliceOfBlock(text, text.length)).toEqual({
			id: 'S2',
			status: 'done',
		});
	});
});

describe('new: in the existence lint', () => {
	it('[<100ms] lets an in-progress slice name a file it has not made yet', () => {
		seed('in-progress', 'in-progress', '`new:src/made.ts`');
		expect(missing()).toEqual([]);
	});
	it('[<100ms] still demands an unmarked file of a slice under way', () => {
		seed('in-progress', 'in-progress', '`src/absent.ts`');
		expect(missing()).toEqual(['src/absent.ts']);
	});
	it('[<100ms] refuses a delivered slice whose new: file was never made, naming slice and path', () => {
		seed('in-progress', 'done', '`new:src/made.ts`');
		expect(missing()).toEqual([
			'src/made.ts (S1 creates it with new:, but it was never created)',
		]);
	});
	it('[<100ms] refuses the same in a review or done proposal with no slice status of its own', () => {
		seed('review', '', '`new:src/made.ts`');
		expect(missing()).toHaveLength(1);
	});
	it('[<100ms] accepts a delivered new: file once it exists', () => {
		mkdirSync(join(root, 'src'), { recursive: true });
		writeFileSync(join(root, 'src/made.ts'), 'export {};\n');
		seed('review', 'done', '`new:src/made.ts`');
		expect(missing()).toEqual([]);
	});
	it('[<100ms] keeps refusing a glob in a delivered slice', () => {
		seed('done', 'done', '`src/*.ts`');
		expect(missing()).toHaveLength(1);
	});
});
