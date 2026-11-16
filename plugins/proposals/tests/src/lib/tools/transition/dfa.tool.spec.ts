/**
 * dfa.tool.spec.ts — a refusal that the proposal already stands in review
 * carries a code, so callers never read its wording.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
	resolveTargetFolder,
	validateCurrentStatus,
	validateTransition,
	validateTransitionArgs,
} from '@delendai/proposals/lib/tools/transition/dfa.tool';

const located = (status: string, absPath = '/x/f00001-a.md') => ({
	absPath,
	folder: 'ready',
	id: 'f00001',
	type: 'fix',
	status,
});

const refusal = (from: 'review' | 'ready', to: 'review') => {
	const result = validateTransition('x00001', from, to);
	expect(result).not.toBeNull();
	return result?.structuredContent as {
		code?: string;
		error: { code?: string; reason: string };
	};
};

describe('validateTransition refusal code', () => {
	it('[<20ms] carries already-in-review on review to review', () => {
		const out = refusal('review', 'review');
		expect(out.code).toBe('already-in-review');
		expect(out.error.code).toBe('already-in-review');
	});

	it('[<20ms] carries no code on another illegal transition', () => {
		const out = refusal('ready', 'review');
		expect(out.code).toBeUndefined();
		expect(out.error.code).toBeUndefined();
	});
});

describe('validateTransitionArgs', () => {
	it('[<20ms] refuses an empty reason and an unknown status, and accepts a valid call', () => {
		expect(
			validateTransitionArgs({ id: 'f1', to: 'review', reason: '' }),
		).not.toBeNull();
		expect(
			validateTransitionArgs({ id: 'f1', to: 'nowhere', reason: 'r' }),
		).not.toBeNull();
		expect(
			validateTransitionArgs({ id: 'f1', to: 'review', reason: 'r' }),
		).toBeNull();
	});
});

describe('validateCurrentStatus', () => {
	it('[<20ms] returns a known status, the pending alias, and refuses a legacy status', () => {
		expect(validateCurrentStatus('f00001', located('review'))).toBe(
			'review',
		);
		expect(validateCurrentStatus('f00001', located('pending'))).toBe(
			'pending',
		);
		expect(
			validateCurrentStatus(
				'p00001',
				located('pending', '/x/p00001-a.md'),
			),
		).toMatchObject({ isError: true });
		expect(validateCurrentStatus('f00001', located('weird'))).toMatchObject(
			{ isError: true },
		);
	});
});

describe('resolveTargetFolder', () => {
	const root = mkdtempSync(join(tmpdir(), 'dfa-tool-'));
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	it('[<50ms] files a done fix under its kind and a missing file under the plain folder', async () => {
		mkdirSync(join(root, 'ready'));
		const absPath = join(root, 'ready', 'f00001-a.md');
		writeFileSync(absPath, '---\nid: f00001\nkind: fix\n---\n');
		expect(
			await resolveTargetFolder('done', located('review', absPath), root),
		).toBe('done/fixes');
		expect(
			await resolveTargetFolder(
				'done',
				located('review', join(root, 'gone.md')),
				root,
			),
		).toBe('done');
	});
});
