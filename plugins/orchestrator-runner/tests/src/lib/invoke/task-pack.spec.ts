/**
 * task-pack.spec.ts — a delegated task becomes the worker's prompt, held to
 * the budget of the model that reads it.
 */
import type { IDelegatedTask } from '@delendai/contracts';
import { describe, expect, it } from 'vitest';

import { renderTaskPack } from '../../../../src/lib/invoke/task-pack.service';
import {
	hopInputBudget,
	overHopBudget,
	promptTokens,
} from '../../../../src/lib/invoke/task-pack-budget.service';

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
	it('names every section of the task, and what could not be given', () => {
		const prompt = renderTaskPack(task, 'export const a = 1;');
		expect(prompt).toContain('## Objective\nRename a to b in src/x.ts');
		expect(prompt).toContain('- no reference to a remains');
		expect(prompt).toContain('- Edit');
		expect(prompt).toContain('export const a = 1;');
		expect(prompt).toContain(
			'## Asked for but not given\n- files:src/gone.ts: not in the workspace',
		);
	});

	it('names the manifest by reference when no context is given inline', () => {
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

	it('asks for JSON when the task declares an output schema', () => {
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
	it('holds two models to their own windows, under the task budget', () => {
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

	it('keeps the task budget for a model whose window is unknown, and nothing when neither is', () => {
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
