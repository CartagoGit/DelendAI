/**
 * bring-forward.script.spec.ts — only this repository's labelled pull
 * requests are brought forward, and in a clone of their own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { toBringForward } from './bring-forward.script';

describe('bring-forward', () => {
	it('[<20ms] leaves a fork’s pull request to its author', () => {
		const pull = (number: number, isCrossRepository: boolean) => ({
			number,
			headRefName: `h${String(number)}`,
			headRefOid: 'a'.repeat(40),
			isCrossRepository,
		});
		expect(
			toBringForward([pull(1, false), pull(2, true)]).map(
				(p) => p.number,
			),
		).toEqual([1]);
	});

	it('[<50ms] builds in a throwaway clone and never forces a push', () => {
		const source = readFileSync(
			join(import.meta.dirname, 'bring-forward.script.ts'),
			'utf8',
		);
		expect(source).toContain('throwawayClone(root,');
		expect(source).toMatch(/root: clone\.dir,\s*remote: clone\.dir,/u);
		expect(source).not.toContain('--force');
	});
});
