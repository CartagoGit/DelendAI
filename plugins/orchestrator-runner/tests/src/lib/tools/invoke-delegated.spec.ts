/**
 * invoke-delegated.spec.ts — `invoke` takes a delegated task in place of
 * text, renders it for the worker and passes its budget and tools on.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit/public';

import type {
	IInvokeArgs,
	IInvokeOutput,
	InvocationManager,
} from '../../../../src/lib/invoke/manager';
import { buildInvokeRegistration } from '../../../../src/lib/tools/invoke.tool';

type IHandler = (args: Record<string, unknown>) => Promise<{
	readonly structuredContent?: Record<string, unknown>;
}>;

const provider = {
	id: 'steady',
	kind: 'cli' as const,
	invoke: { kind: 'cli' as const, command: 'run-steady' },
	modelId: 'steady-model',
	contextWindow: 128_000,
	costTier: 2 as const,
	strengths: [],
	weaknesses: [],
};

const output: IInvokeOutput = {
	decision: {
		strategy: 'cli',
		targetProvider: provider,
		mode: 'implement',
		prompt: 'p',
		invoke: provider.invoke,
		rationale: 'best fit',
		estimatedCostTier: 2,
		alternates: [],
		scoringTrace: [],
		sessionId: 's',
	},
};

const capture = async () => {
	const seen: IInvokeArgs[] = [];
	let handler: IHandler | undefined;
	await buildInvokeRegistration({
		namespacePrefix: 'mcp',
		manager: fakePartial<InvocationManager>({
			invoke: async (args) => {
				seen.push(args);
				return output;
			},
		}),
	}).register(
		createFakeToolServer({
			onRegisterTool: (call) => {
				handler = call.handler as IHandler;
			},
		}),
	);
	if (handler === undefined) throw new Error('handler was not registered');
	return { handler, seen };
};

const delegated = {
	objective: 'Rename a to b',
	contractHash: 'h',
	manifestId: 'm-1',
	allowedTools: ['Read', 'Edit'],
	acceptance: ['b is exported'],
	inputBudget: 9_000,
	moreContext: { allowed: false },
};

describe('invoke with a delegated task', () => {
	it('renders the task as the prompt and passes its budget and tools on', async () => {
		const { handler, seen } = await capture();
		await handler({ delegated, context: 'export const a = 1;' });
		expect(seen[0]?.task).toContain('## Objective\nRename a to b');
		expect(seen[0]?.task).toContain('export const a = 1;');
		expect(seen[0]?.delegation).toEqual({ taskBudget: 9_000 });
		expect(seen[0]?.toolsAllow).toEqual(['Read', 'Edit']);
	});

	it('keeps a caller that passes text as it was', async () => {
		const { handler, seen } = await capture();
		await handler({ task: 'Do the task' });
		expect(seen[0]).toEqual({ task: 'Do the task' });
	});

	it('runs nothing unless exactly one of task and delegated is given', async () => {
		const { handler, seen } = await capture();
		for (const args of [{}, { task: 't', delegated }]) {
			const result = await handler(args);
			expect(result.structuredContent).toMatchObject({ ok: false });
		}
		expect(seen).toEqual([]);
	});
});
