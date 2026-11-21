/**
 * plan-closure-guard.children.spec.ts — a plan's children, written as
 * the nested `contains` mapping, reach the closure guard through the
 * real document parser and the real index: an open child keeps the plan
 * open, by name.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runPlanClosureGuard } from '../../../../src/lib/swarm/plan-closure-guard';

let root = '';
let proposalsDir = '';
let indexPath = '';
let planPath = '';

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'plan-children-'));
	proposalsDir = join(root, 'docs/delendai/proposals');
	indexPath = join(root, '.cache/delendai/proposals/index.json');
	planPath = join(proposalsDir, 'in-progress/q00001-plan.md');
	mkdirSync(join(proposalsDir, 'in-progress'), { recursive: true });
	mkdirSync(join(root, '.cache/delendai/proposals'), { recursive: true });
	writeFileSync(
		planPath,
		[
			'---',
			'id: q00001',
			'type: plan',
			'status: in-progress',
			'contains:',
			'  proposals:',
			'    - f00001',
			'---',
			'',
			'# q00001 — plan',
			'',
		].join('\n'),
	);
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
});

const indexWith = (childStatus: string): void => {
	writeFileSync(
		indexPath,
		JSON.stringify({
			proposals: [
				{
					id: 'q00001',
					file: 'in-progress/q00001-plan.md',
					status: 'in-progress',
				},
				{
					id: 'f00001',
					file: 'ready/f00001-child.md',
					status: childStatus,
				},
			],
		}),
	);
};

const guard = () =>
	runPlanClosureGuard({
		planId: 'q00001',
		planAbsPath: planPath,
		proposalsDirAbs: proposalsDir,
		indexPathAbs: indexPath,
	});

describe('the closure guard sees a plan’s children', () => {
	it('keeps the plan open while a child is open, naming it', async () => {
		indexWith('ready');
		const result = await guard();
		expect(result.closable).toBe(false);
		if (!result.closable) {
			expect(result.blockerLines.join('\n')).toContain('f00001');
		}
	});
});
