import { describe, expect, it, vi } from 'vitest';
import z from 'zod';

import type { IRemoteDiagnosticInput } from '@mcp-vertex/contracts/remote-diagnostics';

import { buildRedactor, diagnoseRemoteExecution } from '../src';

const truncationSchema = z
	.object({
		truncated: z.boolean(),
		reason: z
			.enum(['byte-limit', 'line-limit', 'time-limit', 'server-limit'])
			.nullable(),
		originalBytes: z.number().int().nullable(),
		keptBytes: z.number().int().nullable(),
		originalLines: z.number().int().nullable(),
		keptLines: z.number().int().nullable(),
	})
	.strict();

const providerErrorSchema = z
	.object({
		code: z.string(),
		provider: z.string(),
		message: z.string(),
		status: z.number().int().nullable(),
		requestId: z.string().nullable(),
		retryAfterSeconds: z.number().int().nullable(),
		temporary: z.boolean(),
		retryable: z.boolean(),
	})
	.passthrough();

const correlationSchema = z
	.object({
		commitMatches: z.boolean().nullable(),
		refMatches: z.boolean().nullable(),
		reviewMatches: z.boolean().nullable(),
		notes: z.array(z.string()),
	})
	.strict();

const artifactSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		name: z.string(),
		kind: z.string(),
	})
	.passthrough();

const logSchema = z
	.object({
		availability: z.enum(['complete', 'partial', 'unavailable']),
		text: z.string().nullable(),
		excerptLines: z.array(z.string()),
		url: z.string().nullable(),
		durationMs: z.number().int().nullable(),
		truncated: truncationSchema.nullable(),
		notes: z.array(z.string()),
		errors: z.array(providerErrorSchema),
	})
	.strict();

const jobSchema = z
	.object({
		id: z.union([z.string(), z.number()]),
		name: z.string(),
		status: z.string(),
		relevance: z.enum(['failed', 'relevant']),
		correlation: correlationSchema,
		log: logSchema.nullable(),
		artifacts: z.array(artifactSchema),
	})
	.passthrough();

const evidenceSchema = <T extends z.ZodType>(value: T) =>
	z
		.object({
			availability: z.enum(['complete', 'partial', 'unavailable']),
			value: value.nullable(),
			notes: z.array(z.string()),
			errors: z.array(providerErrorSchema),
			truncated: truncationSchema.nullable(),
		})
		.strict();

const diagnosticResultSchema = z
	.object({
		provider: z.enum(['github', 'gitlab']),
		resource: evidenceSchema(
			z
				.object({
					provider: z.enum(['github', 'gitlab']),
					identifier: z.string(),
					project: z.object({ host: z.string() }).passthrough(),
				})
				.passthrough(),
		),
		commit: evidenceSchema(z.object({ sha: z.string() }).passthrough()),
		review: evidenceSchema(
			z
				.object({
					id: z.union([z.string(), z.number()]),
					kind: z.string(),
				})
				.passthrough(),
		),
		ref: evidenceSchema(z.object({ kind: z.string() }).passthrough()),
		run: evidenceSchema(
			z
				.object({
					id: z.union([z.string(), z.number()]),
					kind: z.string(),
					name: z.string(),
					status: z.string(),
					jobs: z.array(jobSchema),
					artifacts: z.array(artifactSchema),
					correlation: correlationSchema,
				})
				.passthrough(),
		),
		jobs: evidenceSchema(z.array(jobSchema)),
		artifacts: evidenceSchema(z.array(artifactSchema)),
		evidenceAvailability: z.enum(['complete', 'partial', 'unavailable']),
		report: z
			.object({
				summary: z.string(),
				probableCause: z.string(),
				proposedFix: z.string(),
				confidence: z.enum(['high', 'medium', 'low']),
				evidence: z.array(z.string()),
			})
			.strict(),
	})
	.strict();

const input = (): IRemoteDiagnosticInput => {
	const token = 'glpat-very-secret-token';
	const redact = buildRedactor([token]);
	return {
		provider: 'gitlab',
		resource: {
			project: {
				provider: 'gitlab',
				host: 'gitlab.self.example',
				projectPath: 'cartago/mcp-vertex',
				displayName: 'cartago/mcp-vertex',
				webUrl: 'https://gitlab.self.example/cartago/mcp-vertex',
				apiUrl: 'https://gitlab.self.example/api/v4/projects/cartago%2Fmcp-vertex',
			},
			ref: {
				kind: 'branch',
				name: 'main',
				fullName: 'refs/heads/main',
				sha: 'abc123def456',
			},
			commit: {
				sha: 'abc123def456',
				title: 'Stabilize remote diagnostics',
			},
			review: {
				id: 52,
				number: 52,
				kind: 'merge-request',
				state: 'open',
				title: 'Remote diagnostics delivery gate',
				sourceRef: {
					kind: 'branch',
					name: 'main',
					fullName: 'refs/heads/main',
					sha: 'abc123def456',
				},
				headSha: 'abc123def456',
			},
		},
		runs: [
			{
				partial: true,
				errors: [
					{
						code: 'transient',
						provider: 'gitlab',
						message: 'jobs endpoint degraded',
						status: 502,
						requestId: 'req-partial',
						retryAfterSeconds: null,
						temporary: true,
						retryable: true,
					},
				],
				run: {
					id: 'pipeline-91',
					kind: 'pipeline',
					name: 'default',
					status: 'failed',
					createdAt: '2026-08-31T12:00:00.000Z',
					startedAt: '2026-08-31T12:01:00.000Z',
					finishedAt: '2026-08-31T12:05:00.000Z',
					sha: 'ffff9999eeee',
					ref: {
						kind: 'branch',
						name: 'release/1.0',
						fullName: 'refs/heads/release/1.0',
						sha: 'ffff9999eeee',
					},
					webUrl: 'https://gitlab.self.example/cartago/mcp-vertex/-/pipelines/91',
				},
				jobs: [
					{
						id: 'job-1',
						name: 'test',
						stage: 'ci',
						status: 'failed',
						sha: 'ffff9999eeee',
						ref: {
							kind: 'branch',
							name: 'release/1.0',
							fullName: 'refs/heads/release/1.0',
							sha: 'ffff9999eeee',
						},
						webUrl: 'https://gitlab.self.example/cartago/mcp-vertex/-/jobs/1',
						artifacts: [
							{
								id: 'artifact-1',
								name: 'junit.xml',
								kind: 'report',
							},
						],
						log: {
							text: redact(
								[
									'prepare',
									`FATAL token leaked ${token}`,
									'Traceback line',
									'closing context',
								].join('\n'),
							),
							durationMs: 9_500,
							url: 'https://gitlab.self.example/cartago/mcp-vertex/-/jobs/1/raw',
						},
					},
				],
			},
		],
		limits: {
			maxLogBytes: 80,
			maxLogLines: 2,
			maxLogDurationMs: 500,
			maxExcerptLines: 2,
		},
	};
};

describe('remote diagnostics delivery gate', () => {
	it('produces a schema-valid, partial, redacted diagnosis without any network dependency', () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		try {
			const result = diagnoseRemoteExecution(input());

			expect(diagnosticResultSchema.safeParse(result).success).toBe(true);
			expect(fetchSpy).not.toHaveBeenCalled();
			expect(result.evidenceAvailability).toBe('partial');
			expect(result.run.availability).toBe('partial');
			expect(result.run.notes).toContain(
				'selected run came from partial provider data',
			);
			expect(result.run.notes).toContain(
				'run sha does not match the requested commit',
			);
			expect(result.jobs.value?.[0]?.correlation.commitMatches).toBe(
				false,
			);
			expect(result.jobs.value?.[0]?.correlation.refMatches).toBe(false);
			expect(result.jobs.value?.[0]?.log?.truncated?.reason).toBe(
				'time-limit',
			);
			expect(result.jobs.value?.[0]?.log?.excerptLines).toEqual([
				'FATAL token leaked [REDACTED]',
			]);
			expect(result.report.probableCause).toContain('[REDACTED]');
			expect(JSON.stringify(result)).not.toContain(
				'glpat-very-secret-token',
			);
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('reports an unavailable run set reproducibly with a low-confidence fix hint', () => {
		const result = diagnoseRemoteExecution({
			provider: 'github',
			resource: {
				project: {
					provider: 'github',
					host: 'github.com',
					owner: 'CartagoGit',
					repository: 'mcp-vertex',
					displayName: 'CartagoGit/mcp-vertex',
				},
			},
			runs: [],
		});

		expect(diagnosticResultSchema.safeParse(result).success).toBe(true);
		expect(result.run.availability).toBe('partial');
		expect(result.jobs.availability).toBe('partial');
		expect(result.report.confidence).toBe('low');
		expect(result.report.proposedFix).toContain(
			'fetch the latest execution metadata',
		);
	});
});
