import { describe, expect, it } from 'vitest';

import { buildEvalRunRegistration } from './eval-run.tool';
import type { IOutcomeRecord } from '@mcp-vertex/auto-agent-selector/public';

class FakeServer {
	tools: Record<string, { handler: (a: unknown) => Promise<unknown> }> = {};
	registerTool(
		name: string,
		_meta: unknown,
		handler: (a: unknown) => Promise<unknown>,
	) {
		this.tools[name] = { handler };
	}
}

const parseOk = (r: unknown): Record<string, unknown> => {
	const text =
		(r as { content: Array<{ text: string }> }).content[0]?.text ?? '{}';
	return JSON.parse(text) as Record<string, unknown>;
};

const providers = [
	{ id: 'cheap', label: 'Cheap', costTier: 1 as const },
	{ id: 'quality', label: 'Quality', costTier: 4 as const },
];

const build = (records?: IOutcomeRecord[]) => {
	const reg = buildEvalRunRegistration({
		namespacePrefix: 'eval',
		providers,
		allowSpend: async () => true,
		runProvider: async (provider) => ({
			output: provider.id,
			costUsd: provider.id === 'cheap' ? 0.02 : 0.1,
		}),
		checkAcceptance: async (output) => output === 'cheap',
		...(records === undefined
			? {}
			: {
					calibrationStore: {
						append: async (record: IOutcomeRecord) => {
							records.push(record);
						},
						readAll: async () => records,
					},
				}),
	});
	const server = new FakeServer();
	void reg.register(server as never);
	return server.tools;
};

describe('eval-run (f00127 S3)', () => {
	it('registers under the namespace prefix', () => {
		const tools = build();
		expect(Object.keys(tools).sort()).toEqual(['eval_eval_run']);
	});

	it('records winner-based outcomes in the injected calibration store', async () => {
		const records: IOutcomeRecord[] = [];
		const tools = build(records);
		const handler = tools.eval_eval_run?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				prompt: 'fix the bug',
				taskType: 'implement',
				consent: true,
			}),
		);
		expect(out.winner).toBe('cheap');
		expect(records).toEqual([
			{ providerId: 'cheap', success: true, taskType: 'implement' },
			{ providerId: 'quality', success: false, taskType: 'implement' },
		]);
	});

	it('still succeeds when no calibration store is injected', async () => {
		const tools = build();
		const handler = tools.eval_eval_run?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				prompt: 'fix the bug',
				taskType: 'implement',
				consent: true,
			}),
		);
		expect(out.winner).toBe('cheap');
	});
});
