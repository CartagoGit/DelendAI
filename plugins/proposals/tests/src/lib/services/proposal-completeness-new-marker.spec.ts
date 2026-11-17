/**
 * A file a slice creates is declared `new:<path>`; once delivered, the
 * completeness check looks for the path without the marker.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	collectSliceStatuses,
	missingDeclaredFiles,
} from '../../../../src/lib/services/proposal-completeness';

const written = [
	'---',
	'id: x00001',
	'---',
	'',
	'### S1 — creates',
	'- **Status**: done',
	'- **Files**: `new:src/made.ts`',
	'',
].join('\n');

describe('a new: file in the completeness check', () => {
	let workdir = '';
	beforeEach(async () => {
		workdir = await mkdtemp(join(tmpdir(), 'new-marker-'));
	});
	afterEach(async () => {
		await rm(workdir, { recursive: true, force: true });
	});

	it('[<200ms] reads the path without its marker', () => {
		expect(
			collectSliceStatuses(written).map((slice) => slice.files),
		).toEqual([['src/made.ts']]);
	});

	it('[<200ms] owes the file until it exists, then owes nothing', async () => {
		expect(await missingDeclaredFiles(written, workdir)).toEqual([
			'src/made.ts',
		]);
		await mkdir(join(workdir, 'src'), { recursive: true });
		await writeFile(join(workdir, 'src/made.ts'), 'export {};\n');
		expect(await missingDeclaredFiles(written, workdir)).toEqual([]);
	});
});
