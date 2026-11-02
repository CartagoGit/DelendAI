/**
 * self-audit.tool.spec.ts — the public registration runs its scanners and
 * `capabilities` narrows the backlog.
 */
import { describe, expect, it, vi } from 'vitest';

import { createFakeToolServer } from '@delendai/test-kit';
import type { IToolTextResult } from '@delendai/core/public';
import type { IScanResult } from '@delendai/core/public';

const scan = (tool: string, ruleId: string): IScanResult => ({
	tool,
	findings: [{ ruleId, severity: 'high', message: ruleId }],
	summary: { critical: 0, high: 1, medium: 0, low: 0, info: 0 },
	ranAt: '2026-01-01T00:00:00.000Z',
});

vi.mock('../../../../src/lib/self-audit/default-scanners.service', () => ({
	buildDefaultScanners: () =>
		new Map([
			[
				'sec',
				{
					ref: { id: 'sec', label: 'Sec', capability: 'security' },
					run: async () => scan('sec', 'SEC-1'),
				},
			],
			[
				'perf',
				{
					ref: { id: 'perf', label: 'Perf', capability: 'perf' },
					run: async () => scan('perf', 'PERF-1'),
				},
			],
		]),
}));

import { buildSelfAuditRegistration } from '../../../../src/lib/tools/self-audit.tool';

type Handler = (args: unknown) => Promise<IToolTextResult>;

const call = async (
	args: Record<string, unknown>,
): Promise<{
	scannerCount: number;
	skipped: { id: string }[];
	backlog: { finding: { ruleId: string } }[];
}> => {
	const registration = buildSelfAuditRegistration({
		namespacePrefix: 'delendai',
		workspaceRootAbs: '/ws',
	});
	let handler: Handler | undefined;
	await registration.register(
		createFakeToolServer({
			onRegisterTool: (tool) => {
				handler = tool.handler as Handler;
			},
		}),
	);
	const out = await handler!(args);
	return JSON.parse((out.content[0] as { text: string }).text);
};

describe('self_audit public registration', () => {
	it('runs the default scanners when none are injected', async () => {
		const body = await call({});
		expect(body.scannerCount).toBe(2);
		expect(body.backlog.map((b) => b.finding.ruleId).sort()).toEqual([
			'PERF-1',
			'SEC-1',
		]);
	});

	it('capabilities keeps only that capability in the backlog', async () => {
		const body = await call({ capabilities: ['security'] });
		expect(body.backlog.map((b) => b.finding.ruleId)).toEqual(['SEC-1']);
		expect(body.skipped.map((s) => s.id)).toEqual(['perf']);
	});
});
