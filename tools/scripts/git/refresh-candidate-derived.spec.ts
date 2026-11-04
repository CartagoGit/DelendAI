/**
 * refresh-candidate-derived.spec.ts — a candidate is not brought forward
 * for a derived file: what `.gitattributes` declares generated is read
 * through git, patterns and all.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { derivedPaths } from './refresh-candidate-artifacts.script';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('derivedPaths', () => {
	it('is what .gitattributes marks merge=delendai-generated, by pattern', () => {
		const root = mkdtempSync(join(tmpdir(), 'derived-'));
		roots.push(root);
		execFileSync('git', ['init', '-q'], { cwd: root });
		writeFileSync(
			join(root, '.gitattributes'),
			[
				'AGENT.md merge=delendai-generated',
				'**/src/generated/tool-outputs.ts merge=delendai-generated',
				'docs/BUDGETS.md merge=delendai-generated',
				'',
			].join('\n'),
		);
		expect([
			...derivedPaths(root, [
				'plugins/a/AGENT.md',
				'plugins/a/src/generated/tool-outputs.ts',
				'docs/BUDGETS.md',
				'plugins/a/src/index.ts',
				'docs/other.md',
			]),
		]).toEqual([
			'plugins/a/AGENT.md',
			'plugins/a/src/generated/tool-outputs.ts',
			'docs/BUDGETS.md',
		]);
		expect(derivedPaths(root, []).size).toBe(0);
	});
});
