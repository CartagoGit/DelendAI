import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	buildClearRegistration,
	buildReportCompleteRegistration,
	buildStatusRegistration,
} from '@delendai/completion/public';
import { createFakeToolServer } from '@delendai/test-kit/public';
import type {
	IFakeLoggingMessage,
	IFakeRegisteredTool,
} from '@delendai/test-kit/public';

const makeServer = () => {
	const tools = new Map<string, IFakeRegisteredTool>();
	const messages: IFakeLoggingMessage[] = [];
	const server = createFakeToolServer({
		onRegisterTool: (call) => tools.set(call.name, call),
		onSendLoggingMessage: (message) => {
			messages.push(message);
		},
	});
	return { server, tools, messages };
};

const options = (dir: string) => ({
	namespacePrefix: 'completion',
	recordsDir: dir,
	defaultAgent: 'falcon',
});

describe('completion tools', () => {
	let dir = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'completion-tools-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('report_complete requires input (taskId, summary, reviewEvidence)', async () => {
		const { server, tools } = makeServer();
		await buildReportCompleteRegistration(options(dir)).register(server);
		const tool = tools.get('completion_report_complete');
		expect(tool).toBeDefined();
		const inputSchema = (
			tool!.config as {
				inputSchema: {
					safeParse: (v: unknown) => { success: boolean };
				};
			}
		).inputSchema;
		expect(inputSchema.safeParse({}).success).toBe(false);
		expect(
			inputSchema.safeParse({
				taskId: 't1',
				summary: 's',
				reviewEvidence: 'r',
			}).success,
		).toBe(true);
	});

	it('report_complete stores the record and pushes an agent-complete notification', async () => {
		const { server, tools, messages } = makeServer();
		await buildReportCompleteRegistration(options(dir)).register(server);
		const result = (await tools.get('completion_report_complete')!.handler({
			taskId: 't1',
			summary: 'shipped the feature',
			reviewEvidence: 'tests green + diff reviewed',
		})) as { structuredContent: { ok: boolean; record: unknown } };

		expect(result.structuredContent.ok).toBe(true);
		expect(messages).toHaveLength(1);
		expect(messages[0]!.logger).toBe('completion_completion');
		expect(
			(messages[0]!.data as { event?: string; taskId?: string }).event,
		).toBe('agent-complete');
		expect((messages[0]!.data as { taskId?: string }).taskId).toBe('t1');
	});

	it('report_complete redacts secrets before persisting', async () => {
		const { server, tools } = makeServer();
		await buildReportCompleteRegistration(options(dir)).register(server);
		const result = (await tools.get('completion_report_complete')!.handler({
			taskId: 't1',
			summary: 'used OPENAI_API_KEY=abcdef123456',
			reviewEvidence: 'green',
		})) as {
			structuredContent: { record: { summary: string } };
		};
		expect(result.structuredContent.record.summary).not.toContain(
			'abcdef123456',
		);
	});

	it('status lists records newest-first and filters, and clear removes them', async () => {
		const { server, tools } = makeServer();
		const report = buildReportCompleteRegistration(options(dir));
		const status = buildStatusRegistration(options(dir));
		const clear = buildClearRegistration(options(dir));
		await report.register(server);
		await status.register(server);
		await clear.register(server);

		const reportHandler = tools.get('completion_report_complete')!.handler;
		const statusHandler = tools.get('completion_status')!.handler;
		const clearHandler = tools.get('completion_clear')!.handler;

		await reportHandler({
			taskId: 't1',
			summary: 'a',
			reviewEvidence: 'b',
			agent: 'owl',
		});
		await reportHandler({
			taskId: 't2',
			summary: 'c',
			reviewEvidence: 'd',
			agent: 'owl',
		});

		const listed = (await statusHandler({})) as {
			structuredContent: { records: Array<{ taskId: string }> };
		};
		expect(listed.structuredContent.records.map((r) => r.taskId)).toEqual([
			't2',
			't1',
		]);

		const filtered = (await statusHandler({ agent: 'owl' })) as {
			structuredContent: { records: Array<{ taskId: string }> };
		};
		expect(filtered.structuredContent.records).toHaveLength(2);

		const cleared = (await clearHandler({ taskId: 't1' })) as {
			structuredContent: { cleared: boolean };
		};
		expect(cleared.structuredContent.cleared).toBe(true);

		const after = (await statusHandler({})) as {
			structuredContent: { records: Array<{ taskId: string }> };
		};
		expect(after.structuredContent.records.map((r) => r.taskId)).toEqual([
			't2',
		]);
	});
});
