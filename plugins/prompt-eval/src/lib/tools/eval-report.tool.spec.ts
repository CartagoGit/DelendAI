import { describe, expect, it } from 'vitest';

import { buildEvalReportToolRegistration } from './eval-report.tool';
import type { IEvalAttempt } from '../eval/eval-harness';

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

const build = () => {
	const regs = buildEvalReportToolRegistration({ namespacePrefix: 'eval' });
	const server = new FakeServer();
	for (const r of [regs]) void r.register(server as never);
	return server.tools;
};

const attempt = (
	providerId: string,
	costTier: number,
	costUsd: number,
	passed: boolean,
): IEvalAttempt => ({ providerId, costTier, costUsd, passed });

describe('eval-report (f00127 S2)', () => {
	it('registers under the namespace prefix', () => {
		const tools = build();
		expect(Object.keys(tools).sort()).toEqual(['eval_eval_report']);
	});

	it('returns the ranked report + markdown table', async () => {
		const tools = build();
		const handler = tools.eval_eval_report?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				attempts: [
					attempt('cheap', 1, 0.02, true),
					attempt('quality', 4, 0.1, true),
					attempt('flaky', 3, 0.5, false),
				],
			}),
		);
		expect(out.winner).toBe('cheap');
		expect(out.worst).toBe('flaky');
		expect(out.totalCostUsd).toBeCloseTo(0.62, 6);
		expect(out.totalPasses).toBe(2);
		const rows = out.rows as Array<{ providerId: string }>;
		expect(rows[0]?.providerId).toBe('cheap');
		const md = out.markdown as string;
		expect(md).toContain('| Provider |');
		expect(md).toContain('cheap');
		expect(md).toContain('quality');
	});

	it('returns a structured error envelope on empty attempts', async () => {
		const tools = build();
		const handler = tools.eval_eval_report?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const result = (await handler({ attempts: [] })) as {
			isError: boolean;
		};
		expect(result.isError).toBe(true);
	});

	it('surfaces winner=null when no provider passed', async () => {
		const tools = build();
		const handler = tools.eval_eval_report?.handler as (
			a: unknown,
		) => Promise<unknown>;
		const out = parseOk(
			await handler({
				attempts: [
					attempt('a', 3, 0.5, false),
					attempt('b', 4, 0.1, false),
				],
			}),
		);
		expect(out.winner).toBe(null);
		expect(out.worst).toBe('a');
	});
});
