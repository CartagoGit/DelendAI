import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
	buildReportStatusRegistration,
	healthOf,
} from '../src/lib/tools/report-status.tool';
import { createReportStore } from '../src/lib/report-store.service';
import { createFunnelCounterStore } from '../src/lib/funnel-counter-store.service';
import { REPOSITORY_SLUG } from '@delendai/core/public';

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

const jsonSchemaBytesOf = (schema: unknown): number => {
	const candidate = schema as { toJSONSchema?: () => unknown };
	const json =
		typeof candidate?.toJSONSchema === 'function'
			? candidate.toJSONSchema()
			: schema;
	return Buffer.byteLength(JSON.stringify(json), 'utf8');
};

describe('report_status tool', () => {
	/**
	 * v00129 S1 (AUD-B01) regression pin: `report_status` previously
	 * declared its full, strict internal validation schema as the wire
	 * `outputSchema` (~3.9 KB in the `vertex` preset). It now declares
	 * `compactOutputSchema()` instead; the strict schema survives only as
	 * `ReportStatusInternalSchema`, used to validate the handler's own
	 * output before returning it (see the `.parse(...)` call in
	 * `report-status.tool.ts` and the behavioural tests below, which cover
	 * that the real response shape is unchanged). This fails the day the
	 * declared schema regrows.
	 */
	it('declares a compact outputSchema, not the full internal validation shape', async () => {
		const dir = await makeDir();
		let outputSchema: unknown;
		const store = createReportStore(dir);
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
		await reg.register({
			registerTool(
				_name: string,
				config: { outputSchema?: unknown },
			): void {
				outputSchema = config.outputSchema;
			},
		} as unknown as Parameters<typeof reg.register>[0]);
		expect(outputSchema).toBeDefined();
		expect(jsonSchemaBytesOf(outputSchema)).toBeLessThanOrEqual(200);
	});

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
			targetRepo: REPOSITORY_SLUG,
			source: 'default',
			allowlistedRepos: [REPOSITORY_SLUG],
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
				targetRepo: REPOSITORY_SLUG,
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

	// AUD-G01: the whole point of this proposal is that these fields are
	// visible with ZERO arguments — nobody should have to open
	// `reported.json` to answer "is this working?".
	describe('AUD-G01: health and funnel visibility with no arguments', () => {
		const buildHandlerWithBreakerRecord = async (): Promise<{
			readonly handler: ToolHandler;
			readonly funnelDir: string;
		}> => {
			const dir = await makeDir();
			const funnelDir = await makeDir();
			const store = createReportStore(dir);
			// Mirrors the live evidence from the audit almost exactly.
			await store.recordAttempt('25e689a8', {
				at: '2026-08-25T09:31:09.742Z',
				classification: 'BUG',
			});
			await store.recordFailure('25e689a8', {
				at: '2026-08-25T09:31:09.742Z',
				failureCode: 'GH_NOT_INSTALLED',
				nextEligibleAt: '2026-08-25T10:22:16.179Z',
				circuitOpenUntil: '2026-08-25T10:22:16.179Z',
			});
			// Force consecutiveFailureCount to 7 like the evidence.
			for (let i = 0; i < 6; i += 1) {
				await store.recordFailure('25e689a8', {
					at: '2026-08-25T09:31:09.742Z',
					failureCode: 'GH_NOT_INSTALLED',
					nextEligibleAt: '2026-08-25T10:22:16.179Z',
					circuitOpenUntil: '2026-08-25T10:22:16.179Z',
				});
			}
			const funnel = createFunnelCounterStore(funnelDir);
			await funnel.increment({
				stage: 'observedFailures',
				at: '2026-08-25T09:31:09.742Z',
			});
			await funnel.increment({
				stage: 'submissionFailed',
				at: '2026-08-25T09:31:09.742Z',
				failureCode: 'GH_NOT_INSTALLED',
				circuitOpenUntil: '2026-08-25T10:22:16.179Z',
			});
			let handler: ToolHandler | undefined;
			const server = {
				registerTool(
					name: string,
					_config: unknown,
					fn: ToolHandler,
				): void {
					if (name.endsWith('_report_status')) handler = fn;
				},
			};
			const reg = buildReportStatusRegistration({
				namespacePrefix: 'mcp',
				options: {
					enabled: true,
					targetRepo: REPOSITORY_SLUG,
					labels: ['auto-reported'],
					dedupeWindowHours: 24,
					maxIssuesPerDay: 10,
					circuitBreakerThreshold: 7,
					backoffBaseMs: 60_000,
					backoffMaxMs: 3_600_000,
					backoffJitterRatio: 0,
				},
				store,
				funnel,
			});
			await reg.register(
				server as unknown as Parameters<typeof reg.register>[0],
			);
			if (!handler)
				throw new Error('report_status did not register a handler');
			return { handler, funnelDir };
		};

		it('surfaces lastFailureCode, consecutiveFailureCount, circuitOpenUntil and the funnel with zero arguments', async () => {
			const { handler } = await buildHandlerWithBreakerRecord();
			const result = await handler();
			const body = result.structuredContent as {
				health: {
					lastFailureCode?: string;
					consecutiveFailureCount: number;
					circuitOpenUntil?: string;
					circuitOpen: boolean;
					lastAttemptAt?: string;
					lastAttemptAgeMs?: number;
				};
				funnel: Record<string, unknown>;
			};
			expect(body.health.lastFailureCode).toBe('GH_NOT_INSTALLED');
			expect(body.health.consecutiveFailureCount).toBe(7);
			expect(body.health.circuitOpenUntil).toBe(
				'2026-08-25T10:22:16.179Z',
			);
			expect(body.health.lastAttemptAt).toBe('2026-08-25T09:31:09.742Z');
			expect(typeof body.health.lastAttemptAgeMs).toBe('number');
			expect(body.funnel.observedFailures).toBe(1);
			expect(body.funnel.submissionFailed).toBe(1);
			expect(body.funnel.lastFailureCode).toBe('GH_NOT_INSTALLED');
		});

		it('reports circuitOpen: false once the cooldown has passed, even though the record still carries the old circuitOpenUntil', async () => {
			const { handler } = await buildHandlerWithBreakerRecord();
			const result = await handler();
			const body = result.structuredContent as {
				health: { circuitOpen: boolean };
			};
			// circuitOpenUntil (2026-08-25) is long past "now" — the tool
			// must not report the breaker as still open.
			expect(body.health.circuitOpen).toBe(false);
		});
	});

	describe('healthOf', () => {
		it('is neutral with no records', () => {
			const health = healthOf([], Date.now());
			expect(health).toEqual({
				consecutiveFailureCount: 0,
				circuitOpen: false,
			});
		});

		it('reports circuitOpen: true while nowMs is still inside the window', () => {
			const health = healthOf(
				[
					{
						fingerprint: 'fp',
						classification: 'BUG',
						attemptCount: 1,
						consecutiveFailureCount: 3,
						circuitOpenUntil: '2026-08-28T01:00:00.000Z',
					},
				],
				Date.parse('2026-08-28T00:00:00.000Z'),
			);
			expect(health.circuitOpen).toBe(true);
		});

		it('picks the record with the most consecutive failures as the worst', () => {
			const health = healthOf(
				[
					{
						fingerprint: 'quiet',
						classification: 'BUG',
						attemptCount: 1,
						consecutiveFailureCount: 1,
						lastFailureCode: 'GH_EXEC_FAILED',
					},
					{
						fingerprint: 'loud',
						classification: 'BUG',
						attemptCount: 9,
						consecutiveFailureCount: 5,
						lastFailureCode: 'GH_NOT_INSTALLED',
					},
				],
				Date.now(),
			);
			expect(health.lastFailureCode).toBe('GH_NOT_INSTALLED');
			expect(health.consecutiveFailureCount).toBe(5);
		});
	});
});
