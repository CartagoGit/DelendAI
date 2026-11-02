/**
 * acp-handoff.spec.ts — an ACP agent is handed over as the command that
 * starts it, or the `agents show` line that says how, with the task as prompt.
 */
import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';
import type { IRoutingDecision } from '@delendai/core/public';

import { formatHandoff } from '../../../../src/lib/invoke/handoff';

const decision = (invoke: IRoutingDecision['invoke']): IRoutingDecision =>
	fakePartial<IRoutingDecision>({
		mode: 'implement',
		prompt: 'do it',
		invoke,
		targetProvider: fakePartial<IRoutingDecision['targetProvider']>({
			id: 'opencode',
		}),
	});

describe('formatHandoff for an ACP agent', () => {
	it('names the command that starts it', () => {
		const out = formatHandoff(
			decision({ kind: 'acp', command: 'opencode', args: ['acp'] }),
		);
		expect(out).toMatchObject({ kind: 'cli', command: 'opencode acp' });
		expect(out.note).toContain('Agent Client Protocol');
	});

	it('points at the registry entry when it has no command of its own', () => {
		expect(
			formatHandoff(decision({ kind: 'acp', agent: 'opencode' })).command,
		).toBe('delendai agents show opencode');
	});
});
