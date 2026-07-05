/**
 * tools.spec.ts — the two MVP tools against a real temp log.
 *
 * Mirrors the memory plugin's `captureHandler` harness: register the tool
 * against a minimal `registerTool` stub to capture the handler, then drive
 * it directly. Exercises the protocol-facing behaviour (input → structured
 * output) without spinning a transport.
 */
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildUsageTrackingToolRegistrations } from '../../../src/lib/tools';
import type { IInvocationRecord } from '../../../src/lib/types';

type Handler = (a: unknown) => Promise<{
	content: Array<{ text: string }>;
	isError?: boolean;
}>;

const captureHandler = async (reg: IToolRegistration): Promise<Handler> => {
	let handler: Handler | undefined;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: Handler) => {
			handler = h;
		},
	} as never);
	if (!handler) throw new Error('handler not registered');
	return handler;
};

const parse = async (
	h: Handler,
	args: unknown,
): Promise<Record<string, unknown>> => {
	const res = await h(args);
	return JSON.parse(res.content[0]!.text) as Record<string, unknown>;
};

const rec = (over: Partial<IInvocationRecord>): IInvocationRecord => ({
	ts: new Date().toISOString(),
	sessionId: 's',
	agent: { id: 'copilot-1', kind: 'copilot', extension: 'vscode-copilot' },
	plugin: 'proposals',
	tool: 'auto_work',
	model: null,
	usage: null,
	costUsd: null,
	durationMs: null,
	outcome: 'success',
	fallbackFrom: null,
	error: null,
	...over,
});

describe('usage-tracking tools', () => {
	let dir = '';
	let invocationsPath = '';
	let summaryPath = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'ut-tools-'));
		invocationsPath = join(dir, 'invocations.jsonl');
		summaryPath = join(dir, 'usage-summary.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const regs = () =>
		buildUsageTrackingToolRegistrations({
			namespacePrefix: 'mcp-vertex_usage-tracking',
			invocationsPath,
			summaryPath,
		});

	it('registers exactly the two MVP tools', () => {
		expect(regs().map((r) => r.id)).toEqual([
			'usage_report',
			'usage_clear',
		]);
	});

	it('usage_report rolls up by the requested axis + returns expensive calls', async () => {
		writeFileSync(
			invocationsPath,
			`${[
				rec({ plugin: 'proposals', costUsd: 1 }),
				rec({ plugin: 'docs', costUsd: 4 }),
				rec({
					plugin: 'docs',
					costUsd: 2,
					outcome: 'error',
					error: { code: 'x', message: 'y' },
				}),
			]
				.map((r) => JSON.stringify(r))
				.join('\n')}\n`,
			'utf8',
		);
		const report = await captureHandler(regs()[0]!);
		const out = await parse(report, {
			groupBy: 'plugin',
			sortBy: 'costUsd',
		});
		expect((out.totals as { calls: number }).calls).toBe(3);
		const buckets = out.buckets as Array<{ key: string; costUsd: number }>;
		expect(buckets[0]?.key).toBe('docs');
		expect(buckets[0]?.costUsd).toBe(6);
		expect((out.expensiveCalls as unknown[]).length).toBeGreaterThan(0);
	});

	it('usage_report honours the outcome filter', async () => {
		writeFileSync(
			invocationsPath,
			`${[
				rec({ outcome: 'success' }),
				rec({ outcome: 'error', error: { code: 'x', message: 'y' } }),
			]
				.map((r) => JSON.stringify(r))
				.join('\n')}\n`,
			'utf8',
		);
		const report = await captureHandler(regs()[0]!);
		const out = await parse(report, { filter: { outcome: 'error' } });
		expect((out.totals as { calls: number }).calls).toBe(1);
	});

	it('usage_clear refuses without confirmation', async () => {
		writeFileSync(invocationsPath, `${JSON.stringify(rec({}))}\n`, 'utf8');
		const clear = await captureHandler(regs()[1]!);
		const res = await clear({ confirm: false });
		expect(res.isError).toBe(true);
		// Log untouched.
		expect(readFileSync(invocationsPath, 'utf8').trim()).not.toBe('');
	});

	it('usage_clear truncates the log + summary on confirm', async () => {
		writeFileSync(invocationsPath, `${JSON.stringify(rec({}))}\n`, 'utf8');
		writeFileSync(summaryPath, '{"totals":{}}', 'utf8');
		const clear = await captureHandler(regs()[1]!);
		const out = await parse(clear, { confirm: true });
		expect((out as { ok: boolean }).ok).toBe(true);
		expect(readFileSync(invocationsPath, 'utf8')).toBe('');
		expect(existsSync(summaryPath)).toBe(true);
		expect(readFileSync(summaryPath, 'utf8')).toBe('');
	});
});
