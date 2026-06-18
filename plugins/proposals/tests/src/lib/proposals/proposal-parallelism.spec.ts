import { describe, expect, it } from 'vitest';

import { evaluateParallelism } from '@mcp-vertex/proposals/lib/proposals/proposal-parallelism';
import type { IProposalParallelism } from '@mcp-vertex/proposals/lib/proposals/proposal-parallelism';

// ---------------------------------------------------------------------------
// a2-proposal-parallelism-enforcement T1
// Spec TDD cubriendo los pares de lanes reales del workspace.
// Lanes declaradas reflejan el estado in_progress del 2026-06-07 con
// `mainWriteLane` y `parallelismLanes` ya coordinados para ser compatibles.
// ---------------------------------------------------------------------------

/**
 * Set of 5 real in_progress proposals (mutuamente compatibles tras T1):
 *   - p31 (editor)  permits [meta, audit, ui-demo]
 *   - p53 (meta)    permits [editor, meta, audit, ui-demo]
 *   - g1  (ui-demo) permits [editor, ui-demo, audit, meta]
 *   - a1  (audit)   permits all (carve-out)
 *   - a2  (audit)   permits all (carve-out)
 */
const COMPATIBLE_LANES: ReadonlyArray<IProposalParallelism> = [
	{
		proposalId: 'p31',
		mainWriteLane: 'editor',
		parallelismLanes: ['meta', 'audit', 'ui-demo'],
	},
	{
		proposalId: 'p53',
		mainWriteLane: 'meta',
		parallelismLanes: ['editor', 'meta', 'audit', 'ui-demo'],
	},
	{
		proposalId: 'g1-react-demo',
		mainWriteLane: 'ui-demo',
		parallelismLanes: ['editor', 'ui-demo', 'audit', 'meta'],
	},
	{
		proposalId: 'a1-audit-tool-depth-and-cleanup-2026-06-07',
		mainWriteLane: 'audit',
		parallelismLanes: ['audit', 'ui-demo', 'meta', 'editor'],
	},
	{
		proposalId: 'a2-proposal-parallelism-enforcement-2026-06-07',
		mainWriteLane: 'audit',
		parallelismLanes: ['audit', 'ui-demo', 'editor', 'meta'],
	},
];

/**
 * A sixth proposal on the same `editor` lane with empty parallelismLanes,
 * used to verify the lane-bucket block violation.
 */
const CONFLICTING_EDITOR: IProposalParallelism = {
	proposalId: 'pxx-editor-conflict-fixture',
	mainWriteLane: 'editor',
	parallelismLanes: [],
};

describe('evaluateParallelism', () => {
	it('returns withinPolicy:true and empty violations for the 5 mutually compatible actives', () => {
		const result = evaluateParallelism(COMPATIBLE_LANES);
		expect(result.withinPolicy).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it('returns withinPolicy:false with a mainWriteLane block when two editor lanes are in flight', () => {
		const result = evaluateParallelism([
			...COMPATIBLE_LANES,
			CONFLICTING_EDITOR,
		]);
		expect(result.withinPolicy).toBe(false);
		const blockViolations = result.violations.filter(
			(v) => v.severity === 'block',
		);
		expect(blockViolations.length).toBeGreaterThanOrEqual(1);
		const editorBucket = blockViolations.find(
			(v) =>
				v.field === 'mainWriteLane' &&
				v.conflictingProposals.includes('p31') &&
				v.conflictingProposals.includes('pxx-editor-conflict-fixture'),
		);
		expect(editorBucket).toBeDefined();
		expect(editorBucket?.message).toContain('editor');
	});

	it('treats audit lanes as universally parallel-friendly (no violation with any other track)', () => {
		const auditOnly: IProposalParallelism = {
			proposalId: 'a99-fixture',
			mainWriteLane: 'audit',
			parallelismLanes: [
				'audit',
				'editor',
				'meta',
				'ui-demo',
				'game-demo',
			],
		};
		const result = evaluateParallelism([
			auditOnly,
			{
				proposalId: 'p99-fixture',
				mainWriteLane: 'editor',
				parallelismLanes: ['audit'],
			},
		]);
		expect(result.withinPolicy).toBe(true);
	});

	it('returns empty result for an empty actives list (no proposals in flight)', () => {
		const result = evaluateParallelism([]);
		expect(result.withinPolicy).toBe(true);
		expect(result.violations).toEqual([]);
	});

	it('emits at most one violation per conflicting lane (not O(n^2))', () => {
		const threeEditors: IProposalParallelism[] = [
			{ proposalId: 'e1', mainWriteLane: 'editor', parallelismLanes: [] },
			{ proposalId: 'e2', mainWriteLane: 'editor', parallelismLanes: [] },
			{ proposalId: 'e3', mainWriteLane: 'editor', parallelismLanes: [] },
		];
		const result = evaluateParallelism(threeEditors);
		expect(result.violations.length).toBe(1);
	});

	it('emits a block when neither lane permits the other (mutual exclusion)', () => {
		const strictEditor: IProposalParallelism = {
			proposalId: 'p-strict',
			mainWriteLane: 'editor',
			parallelismLanes: [],
		};
		const strictMeta: IProposalParallelism = {
			proposalId: 'p-loose',
			mainWriteLane: 'meta',
			parallelismLanes: [],
		};
		const result = evaluateParallelism([strictEditor, strictMeta]);
		expect(result.withinPolicy).toBe(false);
		expect(
			result.violations.some(
				(v) => v.severity === 'block' && v.field === 'parallelismLanes',
			),
		).toBe(true);
	});
});
