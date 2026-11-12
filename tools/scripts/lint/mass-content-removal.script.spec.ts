/**
 * mass-content-removal.script.spec.ts — a branch answers for what it
 * deleted since it left the integration branch, and for nothing else.
 */
import { describe, expect, it } from 'vitest';

import {
	collectMassContentRemovalFindings,
	type IGitRunner,
	isMassRemovalTrackedPath,
	parseDeletedFilesFromDiff,
	summarizeMassContentRemoval,
} from './mass-content-removal.script';

const DELETED = Array.from(
	{ length: 6 },
	(_, index) => `plugins/a/src/file-${String(index)}.ts`,
);

const recording = (
	output: string,
): { readonly git: IGitRunner; readonly calls: string[][] } => {
	const calls: string[][] = [];
	return {
		calls,
		git: {
			run: (args) => {
				calls.push([...args]);
				return { ok: true, output };
			},
		},
	};
};

describe('collectMassContentRemovalFindings', () => {
	it('measures a branch from where it left the integration branch', () => {
		// Tip against tip counted every file the integration branch gained
		// after the unit left as one the unit deleted.
		const { git, calls } = recording('');
		collectMassContentRemovalFindings({
			branches: ['work/x'],
			integration: 'trunk',
			git,
		});
		expect(calls[0]).toContain('trunk...work/x');
	});

	it('reports a branch that deleted files past the threshold', () => {
		const { git } = recording(DELETED.join('\n'));
		const findings = collectMassContentRemovalFindings({
			branches: ['work/x'],
			integration: 'trunk',
			git,
		});
		expect(findings).toHaveLength(1);
		expect(findings[0]?.count).toBe(DELETED.length);
	});

	it('says nothing of a branch under the threshold', () => {
		const { git } = recording(DELETED.slice(0, 2).join('\n'));
		expect(
			collectMassContentRemovalFindings({
				branches: ['work/x'],
				integration: 'trunk',
				git,
			}),
		).toEqual([]);
	});
});

describe('what counts as removed content', () => {
	it('tracks plugin and core sources, not build output', () => {
		expect(isMassRemovalTrackedPath('plugins/a/src/x.ts')).toBe(true);
		expect(isMassRemovalTrackedPath('plugins/a/dist/x.js')).toBe(false);
		expect(isMassRemovalTrackedPath('docs/x.md')).toBe(false);
	});

	it('is a finding only from the threshold up', () => {
		expect(
			summarizeMassContentRemoval({
				branch: 'b',
				deletedFiles: DELETED,
				threshold: 7,
			}),
		).toBeNull();
	});
});

describe('what a branch is held to', () => {
	it('passes with no tracked deletion, or a single one', () => {
		expect(
			summarizeMassContentRemoval({
				branch: 'agent/x',
				deletedFiles: [],
			}),
		).toBeNull();
		expect(
			summarizeMassContentRemoval({
				branch: 'agent/x',
				deletedFiles: ['plugins/search/src/lib/tools/one.ts'],
			}),
		).toBeNull();
	});

	it('is a same-agent-mass-removal finding at the default threshold', () => {
		const deletedFiles = DELETED.slice(0, 5);
		expect(
			summarizeMassContentRemoval({ branch: 'agent/x', deletedFiles }),
		).toEqual({
			branch: 'agent/x',
			code: 'same-agent-mass-removal',
			count: 5,
			deletedFiles,
		});
	});

	it('filters ignored and out-of-scope deletions before counting', () => {
		expect(
			parseDeletedFilesFromDiff(
				[
					'plugins/search/src/lib/tools/a.ts',
					'plugins/search/dist/b.ts',
					'packages/core/src/lib/c.ts',
					'packages/core/coverage/d.ts',
					'readme.md',
				].join('\n'),
			),
		).toEqual([
			'packages/core/src/lib/c.ts',
			'plugins/search/src/lib/tools/a.ts',
		]);
	});
});
