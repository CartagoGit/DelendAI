/**
 * local-repro.spec.ts — covers v00126 (Track G, audit §33).
 *
 * Exercises the pure logic (parse + select + reproduce) with
 * mocked fetch + runner. The real GitHub API + real `gh` CLI
 * path is exercised by the demo script
 * (`tools/scripts/ci/local-repro.demo.script.ts`) against a recent
 * real run, not by these specs.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	defaultRunner,
	downloadJobLogs,
	extractCommand,
	fetchRunJobs,
	main,
	reproStep,
	resolveToken,
	selectFailedStep,
	type IGitHubRepo,
	type IRunJob,
	type Runner,
} from '../../scripts/ci/local-repro.script';

const fakeFetch = (
	responder: (url: string) => Promise<Response>,
): typeof fetch => {
	return ((url: string | URL | Request, _init?: RequestInit) => {
		const urlStr = typeof url === 'string' ? url : url.toString();
		return responder(urlStr);
	}) as typeof fetch;
};

const jsonResponse = (body: unknown, status = 200): Response =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' },
	});

const REPO: IGitHubRepo = { owner: 'CartagoGit', repo: 'delendai' };

describe('local-repro (v00126) — pure helpers', () => {
	it('selectFailedStep picks the first failed step', () => {
		const jobs: readonly IRunJob[] = [
			{
				id: 1,
				name: 'lint-biome',
				conclusion: 'success',
				status: 'completed',
				steps: [
					{ name: 'Run biome', conclusion: 'success', number: 1 },
				],
			},
			{
				id: 2,
				name: 'tests',
				conclusion: 'failure',
				status: 'completed',
				steps: [
					{ name: 'Setup', conclusion: 'success', number: 1 },
					{ name: 'Run vitest', conclusion: 'failure', number: 2 },
				],
			},
		];
		const step = selectFailedStep(jobs, undefined);
		expect(step?.stepName).toBe('Run vitest');
		expect(step?.jobName).toBe('tests');
	});

	it('selectFailedStep honours --step filter (substring match)', () => {
		const jobs: readonly IRunJob[] = [
			{
				id: 1,
				name: 'lint-biome',
				conclusion: 'failure',
				status: 'completed',
				steps: [
					{ name: 'Run biome', conclusion: 'failure', number: 1 },
				],
			},
			{
				id: 2,
				name: 'tests',
				conclusion: 'failure',
				status: 'completed',
				steps: [
					{ name: 'Run vitest', conclusion: 'failure', number: 1 },
				],
			},
		];
		const step = selectFailedStep(jobs, 'biome');
		expect(step?.jobName).toBe('lint-biome');
	});

	it('selectFailedStep returns null when nothing failed', () => {
		expect(
			selectFailedStep(
				[
					{
						id: 1,
						name: 'lint',
						conclusion: 'success',
						status: 'completed',
					},
				],
				undefined,
			),
		).toBeNull();
	});

	it('extractCommand pulls the command body out of a step log', () => {
		const logs = [
			'2026-08-26T02:13:07.123Z 🚀 Step: Run vitest',
			'2026-08-26T02:13:07.456Z   • Run vitest •••••••••••',
			'2026-08-26T02:13:08.000Z   bunx vitest run --project @delendai/core',
			'2026-08-26T02:13:08.123Z ',
		].join('\n');
		const cmd = extractCommand(logs, 'Run vitest');
		expect(cmd).not.toBeNull();
		expect(cmd).toContain('bunx vitest run --project @delendai/core');
	});
});

describe('local-repro (v00126) — fetch + repro', () => {
	it('fetchRunJobs parses a JSON envelope', async () => {
		const fetcher = fakeFetch(async () =>
			jsonResponse({
				jobs: [
					{
						id: 42,
						name: 'lint-biome',
						conclusion: 'failure',
						status: 'completed',
						steps: [
							{
								name: 'Run biome',
								conclusion: 'failure',
								number: 1,
							},
						],
					},
				],
			}),
		);
		const jobs = await fetchRunJobs(REPO, '12345', null, fetcher);
		expect(jobs).toHaveLength(1);
		expect(jobs[0]?.id).toBe(42);
	});

	it('fetchRunJobs surfaces API errors with the status code', async () => {
		const fetcher = fakeFetch(async () =>
			jsonResponse({ message: 'not found' }, 404),
		);
		await expect(
			fetchRunJobs(REPO, 'missing', null, fetcher),
		).rejects.toThrow(/GitHub API 404/);
	});

	it('downloadJobLogs returns raw text', async () => {
		const fetcher = fakeFetch(
			async () =>
				new Response('2026-08-26T02:13:07.123Z hello world\n', {
					status: 200,
				}),
		);
		const text = await downloadJobLogs(REPO, 42, null, fetcher);
		expect(text).toContain('hello world');
	});

	it('reproStep writes the local log + reports match/mismatch', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'local-repro-spec-'));
		try {
			const fetcher = fakeFetch(
				async () =>
					new Response(
						[
							'2026-08-26T02:13:07.123Z 🚀 Step: Run vitest',
							'2026-08-26T02:13:07.456Z   • Run vitest •••••••••••',
							'2026-08-26T02:13:08.000Z   bunx vitest run',
						].join('\n'),
						{ status: 200 },
					),
			);
			const failingRunner: Runner = async () => ({
				status: 1,
				stdout: 'FAIL  some.spec.ts',
				stderr: '',
			});
			const step = {
				jobId: 99,
				jobName: 'tests',
				stepName: 'Run vitest',
				stepNumber: 1,
			};
			const report = await reproStep(
				REPO,
				'12345',
				step,
				failingRunner,
				tmp,
				fetcher,
			);
			expect(report.localStatus).toBe(1);
			expect(report.matched).toBe(true);
			const written = readFileSync(report.localLogPath, 'utf8');
			expect(written).toContain('FAIL  some.spec.ts');
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});

	it('reproStep returns matched=false when local passes (env divergence)', async () => {
		const tmp = mkdtempSync(join(tmpdir(), 'local-repro-spec-'));
		try {
			const fetcher = fakeFetch(
				async () =>
					new Response(
						[
							'2026-08-26T02:13:07.123Z 🚀 Step: Run vitest',
							'2026-08-26T02:13:07.456Z   • Run vitest •••••••••••',
							'2026-08-26T02:13:08.000Z   bunx vitest run',
						].join('\n'),
						{ status: 200 },
					),
			);
			const passingRunner: Runner = async () => ({
				status: 0,
				stdout: 'all green',
				stderr: '',
			});
			const step = {
				jobId: 99,
				jobName: 'tests',
				stepName: 'Run vitest',
				stepNumber: 1,
			};
			const report = await reproStep(
				REPO,
				'12345',
				step,
				passingRunner,
				tmp,
				fetcher,
			);
			expect(report.localStatus).toBe(0);
			expect(report.matched).toBe(false);
		} finally {
			rmSync(tmp, { recursive: true, force: true });
		}
	});
});

describe('local-repro (v00126) — CLI', () => {
	it('refuses when --run-id is missing (exit 2)', async () => {
		const code = await main([]);
		expect(code).toBe(2);
	});

	it('refuses when --run-id is non-numeric (exit 2)', async () => {
		const code = await main(['--run-id', 'abc', '--dry-run']);
		expect(code).toBe(2);
	});

	it('dry-run prints the plan and exits 0', async () => {
		const code = await main([
			'--run-id',
			'12345',
			'--repo',
			'CartagoGit/delendai',
			'--dry-run',
		]);
		expect(code).toBe(0);
	});

	it('exposes defaultRunner as a function that exits 0 for `true`', async () => {
		// Sanity check: real command runner is wired up to a shell.
		const r = await defaultRunner('true', process.cwd());
		expect(r.status).toBe(0);
	});

	it('resolveToken returns null when neither env nor `gh` token is set', () => {
		const previous = process.env.GITHUB_TOKEN;
		delete process.env.GITHUB_TOKEN;
		try {
			expect(resolveToken()).toBeNull();
		} finally {
			if (previous !== undefined) process.env.GITHUB_TOKEN = previous;
		}
	});
});

// (resolveRepo is exercised indirectly through the CLI spec
//  below — it needs `git remote get-url origin` to be present
//  in the test environment, so the parse logic is also covered
//  by the live verification path described in local-repro.demo.script.ts.)
