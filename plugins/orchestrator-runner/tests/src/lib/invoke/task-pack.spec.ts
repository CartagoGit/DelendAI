/**
 * task-pack.spec.ts — a delegated task becomes the worker's prompt, held to
 * the budget of the model that reads it.
 */
import type { IDelegatedTask } from '@delendai/contracts';
import { describe, expect, it } from 'vitest';

import type { IClosedContract } from '../../../../src/lib/contracts/interfaces/closed-contract.interface';
import {
	renderClosedContract,
	renderTaskPack,
} from '../../../../src/lib/invoke/task-pack.service';
import {
	hopInputBudget,
	overHopBudget,
	promptTokens,
} from '../../../../src/lib/invoke/task-pack-budget.service';

const contract: IClosedContract = {
	objective: 'Rename a to b',
	authorizedFiles: ['src/x.ts'],
	interfaces: ['x.ts exports b'],
	invariants: ['no behaviour change'],
	dependencies: ['none'],
	acceptance: ['no reference to a remains'],
	tests: ['bunx vitest run src/x.spec.ts'],
	budget: { tokens: 8_000, calls: 10, turns: 5, retries: 1 },
	stopConditions: ['a file outside the list needs a change'],
	unit: 'wip/x-S1',
};

const task: IDelegatedTask = {
	objective: 'Rename a to b in src/x.ts',
	contractHash: 'h',
	manifestId: 'm-1',
	allowedTools: ['Read', 'Edit'],
	acceptance: ['src/x.ts exports b', 'no reference to a remains'],
	inputBudget: 8_000,
	missingContext: [
		{ id: 'files:src/gone.ts', reason: 'not in the workspace' },
	],
	moreContext: { allowed: true, via: 'delendai_context_for_change' },
};

describe('renderTaskPack', () => {
	it('[<200ms] names every section of the task, and what could not be given', () => {
		const prompt = renderTaskPack(task, 'export const a = 1;');
		expect(prompt).toContain('## Objective\nRename a to b in src/x.ts');
		expect(prompt).toContain('- no reference to a remains');
		expect(prompt).toContain('- Edit');
		expect(prompt).toContain('export const a = 1;');
		expect(prompt).toContain(
			'## Asked for but not given\n- files:src/gone.ts: not in the workspace',
		);
	});

	it('[<200ms] names the manifest by reference when no context is given inline', () => {
		const prompt = renderTaskPack({
			...task,
			missingContext: undefined,
			allowedTools: [],
		});
		expect(prompt).toContain(
			'Context manifest m-1: read it through delendai_context_for_change.',
		);
		expect(prompt).toContain('- none');
		expect(prompt).not.toContain('Asked for but not given');
	});

	it('[<200ms] asks for JSON when the task declares an output schema', () => {
		expect(
			renderTaskPack({
				...task,
				outputSchema: { type: 'object' },
				moreContext: { allowed: false },
			}),
		).toContain('JSON matching this schema:\n{"type":"object"}');
	});
});

describe('hopInputBudget', () => {
	it('[<200ms] holds two models to their own windows, under the task budget', () => {
		const small = hopInputBudget({
			contextWindow: 8_000,
			taskBudget: 50_000,
		});
		const large = hopInputBudget({
			contextWindow: 1_000_000,
			taskBudget: 50_000,
		});
		expect(small).toEqual({ tokens: 4_000, rule: 'model-window' });
		expect(large).toEqual({ tokens: 50_000, rule: 'task' });
		const pack = 'x'.repeat(4 * 10_000);
		expect(overHopBudget(pack, small)).toContain('over this model');
		expect(overHopBudget(pack, large)).toBeUndefined();
	});

	it('[<200ms] keeps the task budget for a model whose window is unknown, and nothing when neither is', () => {
		expect(hopInputBudget({ contextWindow: 0, taskBudget: 100 })).toEqual({
			tokens: 100,
			rule: 'task',
		});
		expect(hopInputBudget({})).toEqual({ rule: 'none' });
		expect(
			overHopBudget('x'.repeat(10_000), { rule: 'none' }),
		).toBeUndefined();
		expect(promptTokens('abcde')).toBe(2);
	});
});

describe('renderClosedContract', () => {
	it('[<200ms] renders every section and tells the worker it cannot redesign, widen or launch agents', () => {
		const result = renderClosedContract(contract);
		expect(result.ok).toBe(true);
		const prompt = result.ok ? result.prompt : '';
		for (const title of [
			'## Objective',
			'## Authorized files\n- src/x.ts',
			'## Interfaces and expected behaviour',
			'## Invariants',
			'## Dependencies',
			'## Acceptance',
			'## Exact tests',
			'## Budget and limits\n- tokens: 8000',
			'## Stop conditions',
			'wip/x-S1',
			'may not redesign the task, widen its scope or launch other agents',
		]) {
			expect(prompt).toContain(title);
		}
	});

	it('[<200ms] refuses a contract missing a section and names the gaps', () => {
		const result = renderClosedContract({
			...contract,
			tests: [],
			objective: ' ',
			unit: '',
			budget: { ...contract.budget, retries: 0 },
		});
		expect(result).toEqual({
			ok: false,
			missing: ['objective', 'tests', 'budget.retries', 'unit'],
		});
	});
});
