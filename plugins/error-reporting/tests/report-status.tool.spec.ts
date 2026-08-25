import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReportStatusRegistration } from '../src/lib/tools/report-status.tool';
import { createReportStore } from '../src/lib/report-store.service';

type ToolHandler = () => Promise<{
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}>;

const tmpDirs: string[] = [];

const makeDir = async (): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), 'error-reporting-status-'));
	tmpDirs.push(dir);
	return dir;
};

afterEach(async () => {
	await Promise.all(
		tmpDirs
			.splice(0)
			.map((dir) => rm(dir, { recursive: true, force: true })),
	);
});

const capture = async (dir: string): Promise<ToolHandler> => {
	let handler: ToolHandler | undefined;
	const server = {
		registerTool(name: string, _config: unknown, fn: ToolHandler): void {
			if (name.endsWith('_report_status')) handler = fn;
		},
	};
	const store = createReportStore(dir);
	await store.recordAttempt('sig-1', {
		at: '2026-08-24T10:00:00.000Z',
		classification: 'PRIVACY',
	});
	await store.recordSuccess('sig-1', {
		at: '2026-08-24T10:01:00.000Z',
		issueNumber: 12,
		issueUrl: 'https://github.com/acme/tools/issues/12',
	});
	const reg = buildReportStatusRegistration({
		namespacePrefix: 'mcp',
		options: {
			enabled: false,
			targetRepo: 'acme/tools',
			labels: ['auto-reported', 'bug'],
			dedupeWindowHours: 24,
			maxIssuesPerDay: 10,
			circuitBreakerThreshold: 3,
			backoffBaseMs: 60_000,
			backoffMaxMs: 3_600_000,
			backoffJitterRatio: 0.2,
		},
		store,
	});
	await reg.register(server as unknown as Parameters<typeof reg.register>[0]);
	if (!handler) throw new Error('report_status did not register a handler');
	return handler;
};

describe('report_status tool', () => {
	it('reports the fixed destination, exact transmitted fields and local classifications', async () => {
		const handler = await capture(await makeDir());
		const result = await handler();
		const body = result.structuredContent as {
			enabled: boolean;
			destination: {
				targetRepo: string;
				source: string;
				allowlistedRepos: string[];
				transport: string;
				forwardsProjectHeadersOrEnv: boolean;
			};
			projectContextSent: boolean;
			transmittedFields: {
				safeDtoFields: string[];
				issueBodyTableFields: string[];
				issueBodySectionFields: string[];
				excludedHostProjectFields: string[];
			};
			recentReports: {
				fingerprint: string;
				classification: string;
				issueNumber: number;
			}[];
		};
		expect(body.enabled).toBe(false);
		expect(body.destination).toEqual({
			targetRepo: 'acme/tools',
			source: 'operator-configured',
			allowlistedRepos: ['acme/tools'],
			transport: 'gh issue create',
			forwardsProjectHeadersOrEnv: false,
		});
		expect(body.projectContextSent).toBe(false);
		expect(body.transmittedFields.safeDtoFields).toEqual([
			'reporterVersion',
			'mcpVertexVersion',
			'packageId',
			'safeToolId',
			'toolOwner',
			'toolCategory',
			'errorCode',
			'failureClass',
			'classification',
			'fingerprint',
			'mcpFrames',
			'syntheticExample',
			'environmentClass',
		]);
		expect(body.transmittedFields.issueBodyTableFields).toEqual([
			'packageId',
			'reporterVersion',
			'mcpVertexVersion',
			'classification',
			'failureClass',
			'fingerprint',
			'safeToolId',
			'toolOwner',
			'toolCategory',
			'errorCode',
			'environmentClass',
		]);
		expect(body.transmittedFields.issueBodySectionFields).toEqual([
			'mcpFrames',
			'syntheticExample',
			'safeReportPayloadJson',
			'disableInstructions',
		]);
		expect(body.transmittedFields.excludedHostProjectFields).toEqual(
			expect.arrayContaining([
				'message',
				'stack',
				'args',
				'workspace',
				'paths',
				'env',
				'headers',
			]),
		);
		expect(body.recentReports).toEqual([
			expect.objectContaining({
				fingerprint: 'sig-1',
				classification: 'PRIVACY',
				issueNumber: 12,
			}),
		]);
	});

	it('exposes the expected tool id and tags', () => {
		const reg = buildReportStatusRegistration({
			namespacePrefix: 'mcp',
			options: {
				enabled: true,
				targetRepo: 'CartagoGit/mcp-vertex',
				labels: ['auto-reported'],
				dedupeWindowHours: 24,
				maxIssuesPerDay: 10,
				circuitBreakerThreshold: 3,
				backoffBaseMs: 60_000,
				backoffMaxMs: 3_600_000,
				backoffJitterRatio: 0.2,
			},
			store: createReportStore('/tmp/report-status-tool-id'),
		});
		expect(reg.id).toBe('report_status');
		expect(reg.tags).toContain('diagnostics');
	});
});
