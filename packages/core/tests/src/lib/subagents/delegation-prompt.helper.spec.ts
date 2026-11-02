/**
 * delegation-prompt.helper.spec.ts — a host that cannot enforce a
 * manifest gets it as a bounded prompt, with nothing of the session.
 */
import { describe, expect, it } from 'vitest';

import { renderDelegationPrompt } from '@delendai/core/lib/subagents/delegation-prompt.helper';

const task = {
	objective: 'Rename a to b in a.ts',
	contractHash: 'sha256:policy',
	manifestId: 'ctx:abc',
	allowedTools: ['delendai_search'],
	acceptance: ['bun run typecheck', 'a.ts exports b'],
	inputBudget: 8000,
	moreContext: { allowed: true, via: 'delendai_context_expand' },
};

describe('renderDelegationPrompt', () => {
	it('carries the objective, the references, the tools, the budget and what to return', () => {
		const prompt = renderDelegationPrompt(task);
		expect(prompt).toContain('Objective: Rename a to b in a.ts');
		expect(prompt).toContain(
			'manifest ctx:abc (project contract sha256:policy)',
		);
		expect(prompt).toContain('through delendai_context_expand');
		expect(prompt).toContain(
			'Tools you may use: delendai_search. No others.',
		);
		expect(prompt).toContain('at most 8000 input tokens');
		expect(prompt).toContain(
			'Done when: (1) bun run typecheck (2) a.ts exports b',
		);
		expect(prompt).toContain('Return a short receipt');
	});

	it('says what to use when no tool is allowed, and asks for the output schema', () => {
		const prompt = renderDelegationPrompt({
			...task,
			allowedTools: [],
			acceptance: [],
			moreContext: { allowed: false },
			outputSchema: { type: 'object' },
		});
		expect(prompt).toContain(
			'Use no tool beyond reading what the manifest references.',
		);
		expect(prompt).not.toContain('Done when');
		expect(prompt).not.toContain('through ');
		expect(prompt).toContain(
			'Return a receipt matching this JSON Schema: {"type":"object"}',
		);
	});

	it('says what context could not be given, so the subagent does not look for it', () => {
		const prompt = renderDelegationPrompt({
			...task,
			missingContext: [{ id: 'files:gone.ts', reason: 'ENOENT' }],
		});
		expect(prompt).toContain('Not available: files:gone.ts (ENOENT).');
		expect(renderDelegationPrompt(task)).not.toContain('Not available');
	});
});
