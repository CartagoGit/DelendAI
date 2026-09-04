import { describe, expect, it } from 'vitest';

import type {
	IRemoteDiagnosticArtifact,
	IRemoteDiagnosticInput,
	IRemoteDiagnosticJob,
	IRemoteDiagnosticRunCandidate,
} from '@delendai/contracts/remote-diagnostics';

import {
	DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
	diagnoseRemoteExecution,
} from '../src';

const project = {
	provider: 'github' as const,
	host: 'github.example',
	owner: 'cartago',
	repository: 'mcp-vertex',
	displayName: 'cartago/mcp-vertex',
	webUrl: 'https://github.example/cartago/mcp-vertex',
	apiUrl: 'https://github.example/api/v3/repos/cartago/mcp-vertex',
};

const branchRef = {
	kind: 'branch' as const,
	name: 'main',
	fullName: 'refs/heads/main',
	sha: 'abc123def456',
	url: 'https://github.example/cartago/mcp-vertex/tree/main',
};

const artifact = (id: string, name: string): IRemoteDiagnosticArtifact => ({
	id,
	name,
	kind: 'report',
	downloadUrl: `https://github.example/artifacts/${id}`,
});

const job = (
	overrides: Partial<IRemoteDiagnosticJob> &
		Pick<IRemoteDiagnosticJob, 'id' | 'name' | 'status'>,
): IRemoteDiagnosticJob => ({
	sha: 'abc123def456',
	ref: branchRef,
	...overrides,
});

const runCandidate = (
	overrides: Partial<IRemoteDiagnosticRunCandidate> = {},
): IRemoteDiagnosticRunCandidate => ({
	run: {
		id: 'run-1',
		kind: 'workflow-run',
		name: 'CI',
		status: 'failed',
		createdAt: '2026-08-31T12:00:00.000Z',
		startedAt: '2026-08-31T12:01:00.000Z',
		finishedAt: '2026-08-31T12:05:00.000Z',
		sha: 'abc123def456',
		ref: branchRef,
		webUrl: 'https://github.example/cartago/mcp-vertex/actions/runs/1',
	},
	...overrides,
});

const input = (
	runs: readonly IRemoteDiagnosticRunCandidate[],
	overrides: Partial<IRemoteDiagnosticInput> = {},
): IRemoteDiagnosticInput => ({
	resource: {
		project,
		ref: branchRef,
		commit: {
			sha: 'abc123def456',
			title: 'Fix remote diagnostics',
		},
		review: {
			id: 44,
			number: 44,
			kind: 'pull-request',
			state: 'open',
			title: 'Remote CI diagnostics',
			sourceRef: branchRef,
			headSha: 'abc123def456',
		},
	},
	runs,
	...overrides,
});

describe('diagnoseRemoteExecution', () => {
	it('selects the latest run and truncates oversized logs by bytes', () => {
		const largeLog = [
			'Compile step failed with ERROR missing lockfile',
			...Array.from({ length: 40 }, (_, index) => `noise-${index}`),
		].join('\n');
		const result = diagnoseRemoteExecution(
			input(
				[
					runCandidate({
						run: {
							id: 'run-older',
							kind: 'workflow-run',
							name: 'CI',
							status: 'success',
							createdAt: '2026-08-31T10:00:00.000Z',
							finishedAt: '2026-08-31T10:10:00.000Z',
							sha: 'abc123def456',
							ref: branchRef,
						},
					}),
					runCandidate({
						run: {
							id: 'run-latest',
							kind: 'workflow-run',
							name: 'CI',
							status: 'failed',
							createdAt: '2026-08-31T13:00:00.000Z',
							finishedAt: '2026-08-31T13:10:00.000Z',
							sha: 'abc123def456',
							ref: branchRef,
						},
						jobs: [
							job({
								id: 'job-build',
								name: 'build',
								status: 'failed',
								finishedAt: '2026-08-31T13:09:00.000Z',
								log: { text: largeLog },
							}),
						],
					}),
				],
				{
					limits: {
						...DEFAULT_REMOTE_DIAGNOSTIC_LIMITS,
						maxLogBytes: 120,
						maxLogLines: 50,
					},
				},
			),
		);

		expect(result.run.value?.id).toBe('run-latest');
		expect(result.jobs.value).toHaveLength(1);
		expect(result.jobs.value?.[0]?.log?.truncated?.reason).toBe(
			'byte-limit',
		);
		expect(result.jobs.value?.[0]?.log?.availability).toBe('partial');
		expect(result.report.probableCause).toContain('ERROR missing lockfile');
		expect(result.evidenceAvailability).toBe('partial');
	});

	it('marks timed-out log capture as partial time-limited evidence', () => {
		const result = diagnoseRemoteExecution(
			input(
				[
					runCandidate({
						jobs: [
							job({
								id: 'job-test',
								name: 'test',
								status: 'failed',
								log: {
									text: 'npm test\nTimeout while waiting for service\n',
									durationMs: 9_000,
									error: {
										code: 'timeout',
										provider: 'github',
										message: 'request timeout',
										status: null,
										requestId: null,
										retryAfterSeconds: null,
										temporary: true,
										retryable: true,
									},
								},
							}),
						],
					}),
				],
				{
					limits: { maxLogDurationMs: 2_000 },
				},
			),
		);

		const log = result.jobs.value?.[0]?.log;
		expect(log?.truncated?.reason).toBe('time-limit');
		expect(log?.availability).toBe('partial');
		expect(log?.errors[0]?.code).toBe('timeout');
		expect(result.report.confidence).toBe('medium');
	});

	it('keeps only failed or relevant jobs and truncates by lines when needed', () => {
		const result = diagnoseRemoteExecution(
			input(
				[
					runCandidate({
						artifacts: [artifact('run-report', 'run-report.xml')],
						jobs: [
							job({
								id: 'job-build',
								name: 'build',
								status: 'failed',
								artifacts: [
									artifact(
										'build-report',
										'build-report.xml',
									),
								],
								log: {
									text: 'error: linker failed\nstack\ncontext',
								},
							}),
							job({
								id: 'job-lint',
								name: 'lint',
								status: 'success',
								log: { text: 'ok' },
							}),
							job({
								id: 'job-deploy',
								name: 'deploy',
								status: 'canceled',
								log: { text: 'line-1\nline-2\nline-3\nline-4' },
							}),
						],
					}),
				],
				{
					limits: { maxLogLines: 2 },
				},
			),
		);

		expect(result.jobs.value?.map((entry) => entry.name)).toEqual([
			'build',
			'deploy',
		]);
		expect(result.jobs.value?.[1]?.log?.truncated?.reason).toBe(
			'line-limit',
		);
		expect(result.artifacts.value).toHaveLength(2);
		expect(result.report.evidence.join(' ')).toContain('build:failed');
		expect(result.report.evidence.join(' ')).toContain('deploy:canceled');
	});

	it('reports partial evidence when provider data is incomplete', () => {
		const result = diagnoseRemoteExecution({
			provider: 'gitlab',
			resource: {
				project: {
					provider: 'github',
					host: 'gitlab.example',
					projectPath: 'cartago/mcp-vertex',
				},
			},
			runs: [
				runCandidate({
					partial: true,
					errors: [
						{
							code: 'transient',
							provider: 'gitlab',
							message: 'jobs endpoint unavailable',
							status: 502,
							requestId: 'req-1',
							retryAfterSeconds: null,
							temporary: true,
							retryable: true,
						},
					],
					jobs: [],
				}),
			],
		});

		expect(result.provider).toBe('gitlab');
		expect(result.resource.notes).toContain(
			'input provider overrides the project provider',
		);
		expect(result.run.availability).toBe('partial');
		expect(result.jobs.availability).toBe('partial');
		expect(result.review.availability).toBe('partial');
		expect(result.evidenceAvailability).toBe('partial');
		expect(result.report.proposedFix).toContain(
			'fetch the latest execution metadata',
		);
	});
});
