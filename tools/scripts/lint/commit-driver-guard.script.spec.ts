import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { lintCommitDriverGuardFromSources } from './commit-driver-guard.script';

const repoRoot = process.cwd();
const driverFile = 'plugins/commit-policy/src/lib/services/commit-driver.ts';
const driverSource = readFileSync(join(repoRoot, driverFile), 'utf8');

const swapTokens = (source: string, first: string, second: string): string => {
	return source
		.replace(first, '__FIRST__')
		.replace(second, first)
		.replace('__FIRST__', second);
};

const extractBlock = (source: string, anchor: string): string => {
	const start = source.indexOf(anchor);
	if (start < 0) throw new Error(`missing anchor: ${anchor}`);
	const bodyStart = source.indexOf('{', start);
	if (bodyStart < 0) throw new Error(`missing body: ${anchor}`);
	let depth = 0;
	for (let index = bodyStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === '{') depth += 1;
		if (char === '}') depth -= 1;
		if (depth === 0) return source.slice(start, index + 1);
	}
	throw new Error(`unclosed block: ${anchor}`);
};

const swapTokensInBlock = (
	source: string,
	anchor: string,
	first: string,
	second: string,
): string => {
	const block = extractBlock(source, anchor);
	return source.replace(block, swapTokens(block, first, second));
};

describe('lintCommitDriverGuardFromSources', () => {
	it('passes on the real commit-driver source', () => {
		expect(lintCommitDriverGuardFromSources(driverSource, []).ok).toBe(
			true,
		);
	});

	it('flags reordered shared-index commit flow when commit moves before assertSubset', () => {
		const reordered = swapTokensInBlock(
			driverSource,
			'const commitWithSharedIndexGuard = async (',
			'const extras = staged.filter(',
			'const commitResult = await gitCommit(args.run, args.message, {',
		);
		const result = lintCommitDriverGuardFromSources(reordered, []);
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					rule: 'commitWithSharedIndexGuard-order',
					detail: 'expected assertSubset before commit',
				}),
			]),
		);
	});

	it('flags reordered isolated commit flow when commit-tree moves before assertSubset', () => {
		const reordered = swapTokensInBlock(
			driverSource,
			'export const commitWithGuard = async (',
			'const extras = staged.filter(',
			'const commitTreeResult = await isolatedRun(commitTreeArgs);',
		);
		const result = lintCommitDriverGuardFromSources(reordered, []);
		expect(result.ok).toBe(false);
		expect(result.violations).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					rule: 'commitWithGuard-order',
					detail: 'expected assertSubset before write-tree',
				}),
			]),
		);
	});
});
