/**
 * proposal-completeness-moved.spec.ts — the closing gate reads a slice's
 * declared documents as the review entry does: the proposal's own, and
 * another's cited by a folder it has left, are still there.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { guardSlicesComplete } from '../../../../src/lib/services/proposal-completeness';

describe('guardSlicesComplete — documents that moved folder', () => {
	let root = '';
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'completeness-moved-'));
		await mkdir(join(root, 'docs/delendai/proposals/review'), {
			recursive: true,
		});
		await mkdir(join(root, 'docs/delendai/proposals/done'), {
			recursive: true,
		});
		await writeFile(
			join(root, 'docs/delendai/proposals/review/x00099-own.md'),
			'own',
		);
		await writeFile(
			join(root, 'docs/delendai/proposals/done/x00098-other.md'),
			'other',
		);
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('closes a slice that declares its own document and another proposal by an old folder', async () => {
		const md = [
			'---',
			'id: x00099',
			'---',
			'',
			'### S1 — evidence',
			'- **Status**: done',
			'- **Files**:',
			'  - `docs/delendai/proposals/in-progress/x00099-own.md`',
			'  - `docs/delendai/proposals/ready/x00098-other.md`',
			'',
		].join('\n');
		const result = await guardSlicesComplete({
			markdown: md,
			workspaceRoot: root,
		});
		expect(result.ok).toBe(true);
	});

	it('still refuses a code file that is not there', async () => {
		const md = [
			'---',
			'id: x00099',
			'---',
			'',
			'### S1 — code',
			'- **Status**: done',
			'- **Files**: `src/gone.ts`',
			'',
		].join('\n');
		const result = await guardSlicesComplete({
			markdown: md,
			workspaceRoot: root,
		});
		expect(result).toMatchObject({
			ok: false,
			code: 'missing-declared-files',
			missingFiles: ['src/gone.ts'],
		});
	});
});
