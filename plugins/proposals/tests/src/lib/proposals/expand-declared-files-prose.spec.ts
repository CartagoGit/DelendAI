/**
 * expand-declared-files-prose.spec.ts — a `Files:` line is written by a
 * person, and the prose in it is not a path.
 *
 * Every string here is copied from a live server's log, where every
 * automatic slice checkpoint in a session failed with `unclaimable
 * paths` and no work ref moved at all.
 */
import { describe, expect, it } from 'vitest';

import {
	expandDeclaredFiles,
	looksLikePath,
} from '@delendai/proposals/lib/proposals/expand-declared-files';

describe('a Files line declares paths, not sentences (x00562)', () => {
	it('keeps the path and drops the annotation beside it', () => {
		expect(
			expandDeclaredFiles(
				'`packages/cli/package.json` (NEW; `private: true`; `bin: { "delendai": "./dist/index.js" }`)',
			),
		).toEqual(['packages/cli/package.json']);
	});

	it('drops the identifiers a slice lists as prose', () => {
		// These reached the engine as claimed paths.
		expect(
			expandDeclaredFiles(
				'`getOverviewModel(): Promise<IDashboardOverview>`, `getAllModels(): Promise<IDashboardAllModels>`',
			),
		).toEqual([]);
		expect(
			expandDeclaredFiles(
				'`packages/ui-extension/src/dashboard/format.ts` — pure helpers: `formatBytes`, `formatMs`',
			),
		).toEqual(['packages/ui-extension/src/dashboard/format.ts']);
	});

	it('keeps the glob declarations a proposal legitimately writes', () => {
		expect(
			expandDeclaredFiles(
				'`docs/proposals/ready/**`, `plugins/conventions/src/lib/tools/*.tool.ts`',
			),
		).toEqual([
			'docs/proposals/ready/**',
			'plugins/conventions/src/lib/tools/*.tool.ts',
		]);
	});

	it('still expands braces, and still drops prose inside them', () => {
		expect(
			expandDeclaredFiles('`packages/cli/src/commands/{status,init}.ts`'),
		).toEqual([
			'packages/cli/src/commands/status.ts',
			'packages/cli/src/commands/init.ts',
		]);
	});

	it('recognises a path by its separator or its extension, nothing else', () => {
		for (const path of [
			'packages/core/src/index.ts',
			'lefthook.yml',
			'docs/delendai/AGENT-BOOTSTRAP.md',
			'plugins/x/tests/**',
		]) {
			expect(looksLikePath(path)).toBe(true);
		}
		for (const prose of [
			'private: true',
			'getAllModels(): Promise<IDashboardAllModels>',
			'NEW',
			'a sentence with spaces',
			'- a bullet',
			'"quoted"',
		]) {
			expect(looksLikePath(prose)).toBe(false);
		}
	});
});
