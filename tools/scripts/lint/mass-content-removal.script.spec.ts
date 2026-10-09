/**
 * mass-content-removal.script.spec.ts — a branch answers for what it
 * deleted since it left the integration branch, and for nothing else.
 */
import { describe, expect, it } from 'vitest';

import {
	collectMassContentRemovalFindings,
	type IGitRunner,
	isMassRemovalTrackedPath,
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
