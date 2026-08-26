#!/usr/bin/env bun
/**
 * local-repro.script.ts — v00126 (Track G, audit §33).
 *
 * Given a CI run ID, download the failed job's logs from
 * GitHub Actions, identify the step that failed, and re-run
 * that step locally with the same working directory. The diff
 * between the local log and the CI log lets a developer (or
 * another agent) tell whether the failure is reproducible
 * locally or whether it's an environment divergence.
 *
 * Why this lives here
 * -------------------
 * The audit's flagged DX gap: when CI fails, the developer
 * has to eyeball the log, guess the command, and rerun it
 * locally — if it passes locally the loop is broken. This
 * script automates the most common case (a single failing
 * step in a single failing job).
 *
 * Privacy posture (R1.1–R1.10)
 * ----------------------------
 * - Auth: uses `GITHUB_TOKEN` env or `gh auth token`. Never
 *   accepts a token on the CLI (would land in shell history).
 * - Output: writes the local log under `build/ci/`, never
 *   outside the repo. Never uploads anywhere.
 * - No telemetry. The script never talks to anything other
 *   than the GitHub REST API for the one user-supplied run.
 *
 * Usage:
 *
 *   bun tools/scripts/ci/local-repro.script.ts --run-id <id>
 *   bun tools/scripts/ci/local-repro.script.ts --run-id <id> --repo <owner>/<repo>
 *   bun tools/scripts/ci/local-repro.script.ts --run-id <id> --step "lint-biome"
 *
 * Exit codes:
 *   0  Local reproduction matches CI's failure (same exit code, similar output).
 *   1  Local reproduction diverges (CI failed, local passed) — environment issue.
 *   2  Input/config error (no run-id, gh not installed, …).
 *   3  No failed step in the run (already green).
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

interface IRunJob {
	readonly id: number;
	readonly name: string;
	readonly conclusion: string | null;
	readonly status: string;
	readonly steps?: readonly {
		readonly name: string;
		readonly conclusion: string | null;
		readonly number: number;
	}[];
}

interface IFailedStep {
	readonly jobId: number;
	readonly jobName: string;
	readonly stepName: string;
	readonly stepNumber: number;
}

interface IGitHubRepo {
	readonly owner: string;
	readonly repo: string;
}

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const flag = (argv: readonly string[], name: string): string | undefined => {
	for (let i = 0; i < argv.length; i += 1) {
		const token = argv[i];
		if (token === undefined) continue;
		if (token === `--${name}`) return argv[i + 1];
		if (token.startsWith(`--${name}=`))
			return token.slice(`--${name}=`.length);
	}
	return undefined;
};

const hasFlag = (argv: readonly string[], name: string): boolean =>
	argv.some((t) => t === `--${name}` || t.startsWith(`--${name}=`));

/**
 * Strip comments + trim a CLI flag. Reused so the parse layer
 * has one consistent definition.
 */
const trim = (s: string): string => s.trim();

/**
 * Resolve the GitHub repo the user wants to query. Reads the
 * `origin` remote from `git remote get-url origin` and extracts
 * `<owner>/<repo>`. Falls back to `GITHUB_REPOSITORY` when the
 * remote isn't a GitHub URL (e.g. local-only test fixture).
 */
export const resolveRepo = (cwd: string): IGitHubRepo | null => {
	const gh = process.env.GITHUB_REPOSITORY;
	if (typeof gh === 'string' && gh.includes('/')) {
		const [owner, repo] = gh.split('/');
		if (owner !== undefined && repo !== undefined) {
			return { owner, repo };
		}
	}
	const r = spawnSync('git', ['remote', 'get-url', 'origin'], {
		cwd,
		encoding: 'utf8',
	});
	if (r.status !== 0) return null;
	const url = (r.stdout ?? '').trim();
	// SSH:   git@github.com:owner/repo.git
	// HTTPS: https://github.com/owner/repo.git
	const sshMatch = url.match(/git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (sshMatch !== null) {
		return { owner: sshMatch[1] ?? '', repo: sshMatch[2] ?? '' };
	}
	const httpsMatch = url.match(/https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
	if (httpsMatch !== null) {
		return { owner: httpsMatch[1] ?? '', repo: httpsMatch[2] ?? '' };
	}
	return null;
};

/**
 * Probe whether `gh` is on PATH. Returns the resolved path or
 * null. We don't shell out to `gh api`; the script uses `fetch`
 * directly so the spec can stub it without a real gh install.
 */
export const hasGhCli = (): string | null => {
	const r = spawnSync('command', ['-v', 'gh'], { encoding: 'utf8' });
	if (r.status !== 0) return null;
	return (r.stdout ?? '').trim();
};

/**
 * Read the GitHub token from `GITHUB_TOKEN` env or
 * `gh auth token`. Returns null when neither is available —
 * the caller surfaces a friendly exit 2.
 */
export const resolveToken = (): string | null => {
	const env = process.env.GITHUB_TOKEN;
	if (typeof env === 'string' && env.length > 0) return env;
	const r = spawnSync('gh', ['auth', 'token'], { encoding: 'utf8' });
	if (r.status !== 0) return null;
	const token = (r.stdout ?? '').trim();
	return token.length > 0 ? token : null;
};

/**
 * Fetch the jobs of a GitHub Actions run. Uses `fetch` (Node /
 * Bun global) so the spec can swap the implementation.
 *
 * Visible for tests so the parse-and-dispatch path can run
 * against fixture responses without hitting the API.
 */
export const fetchRunJobs = async (
	repo: IGitHubRepo,
	runId: string,
	token: string | null,
	fetcher: typeof fetch = fetch,
): Promise<readonly IRunJob[]> => {
	const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/jobs?per_page=100`;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (token !== null) headers.Authorization = `Bearer ${token}`;
	const res = await fetcher(url, { headers });
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on run ${runId}: ${await res.text()}`,
		);
	}
	const body = (await res.json()) as { jobs?: readonly IRunJob[] };
	return body.jobs ?? [];
};

/**
 * Find the first failed step across the run's jobs. Prefers
 * the user-supplied `--step` name when present (so the script
 * can target a specific failure rather than the chronologically
 * first one).
 */
export const selectFailedStep = (
	jobs: readonly IRunJob[],
	stepFilter: string | undefined,
): IFailedStep | null => {
	const failedJobs = jobs.filter((j) => j.conclusion === 'failure');
	for (const job of failedJobs) {
		const failedSteps = (job.steps ?? []).filter(
			(s) => s.conclusion === 'failure',
		);
		for (const step of failedSteps) {
			if (
				stepFilter === undefined ||
				step.name.toLowerCase().includes(stepFilter.toLowerCase())
			) {
				return {
					jobId: job.id,
					jobName: job.name,
					stepName: step.name,
					stepNumber: step.number,
				};
			}
		}
	}
	return null;
};

/**
 * Download the raw logs for a single job. The endpoint returns
 * plain text — no JSON wrapping.
 */
export const downloadJobLogs = async (
	repo: IGitHubRepo,
	jobId: number,
	token: string | null,
	fetcher: typeof fetch = fetch,
): Promise<string> => {
	const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/jobs/${jobId}/logs`;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (token !== null) headers.Authorization = `Bearer ${token}`;
	const res = await fetcher(url, { headers, redirect: 'follow' });
	if (!res.ok) {
		throw new Error(
			`GitHub API ${res.status} on job ${jobId} logs: ${await res.text()}`,
		);
	}
	return await res.text();
};

/**
 * Pull the actual shell command out of a GitHub Actions log
 * for the failed step. The log has this shape:
 *
 *   \u00f0\u009f\u009a\x80\xf0\u009f\u009a\x80\xf0\u009f\u009a\x80 step name
 *   \u2022 step name \u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022
 *   2026-08-26T02:13:07.123Z
 *   \u2022 The operation was canceled.
 *
 * For a `run:` step the actual command appears below as a
 * multi-line block; we extract the longest block of contiguous
 * lines that look like a shell command.
 */
export const extractCommand = (
	logs: string,
	stepName: string,
): string | null => {
	const lines = logs.split('\n');
	const stepStart = lines.findIndex((line) =>
		line.toLowerCase().includes(stepName.toLowerCase()),
	);
	if (stepStart === -1) return null;

	// GitHub Actions prefixes every log line with a timestamp and
	// virtualisation marker; strip them so the extracted command
	// is shell-runnable as-is.
	const stripPrefix = (line: string): string =>
		line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s+/, '');

	const block: string[] = [];
	for (let i = stepStart + 1; i < lines.length; i += 1) {
		const stripped = stripPrefix(lines[i] ?? '');
		if (stripped.length === 0) {
			if (block.length > 0) break;
			continue;
		}
		block.push(stripped);
	}
	if (block.length === 0) return null;
	return block.join('\n');
};

export interface IRunnerResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

/**
 * Default runner: execute the command with the same working
 * directory the script was invoked from. Uses Node's `spawn`
 * (Bun and Node both ship it) so the function is testable
 * under either runtime.
 */
export const defaultRunner = (
	command: string,
	cwd: string,
): Promise<IRunnerResult> =>
	new Promise((resolveFn) => {
		const child = spawn(command, {
			cwd,
			shell: true,
			env: { ...process.env, CI_REPRO: '1' },
		});
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
		child.on('close', (status) => {
			resolveFn({
				status,
				stdout: Buffer.concat(stdoutChunks).toString('utf8'),
				stderr: Buffer.concat(stderrChunks).toString('utf8'),
			});
		});
	});

export type Runner = (command: string, cwd: string) => Promise<IRunnerResult>;

/**
 * Compare the local repro result against the CI log + exit
 * code. Returns a structured report the caller can print.
 */
export interface IReproReport {
	readonly localStatus: number | null;
	readonly ciStatus: number | null;
	readonly matched: boolean;
	readonly localLogPath: string;
}

export const reproStep = async (
	repo: IGitHubRepo,
	runId: string,
	step: IFailedStep,
	runner: Runner,
	outputDir: string,
	fetcher: typeof fetch = fetch,
): Promise<IReproReport> => {
	const token = resolveToken();
	const ciLogs = await downloadJobLogs(repo, step.jobId, token, fetcher);
	const command = extractCommand(ciLogs, step.stepName);
	if (command === null) {
		throw new Error(
			`Could not extract a runnable command from step "${step.stepName}" in job ${step.jobId}`,
		);
	}

	const local = await runner(command, repoRoot());

	mkdirSync(outputDir, { recursive: true });
	const localLogPath = join(outputDir, `local-repro-${runId}-job${step.jobId}.log`);
	const localContent = `${local.stdout}${local.stderr.length > 0 ? `\n--- stderr ---\n${local.stderr}` : ''}`;
	writeFileSync(localLogPath, localContent);

	return {
		localStatus: local.status,
		// CI doesn't surface a numeric exit code for cancelled
		// steps; we treat non-success as `1` for the diff.
		ciStatus: 1,
		matched: local.status !== 0,
		localLogPath,
	};
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const runId = flag(argv, 'run-id');
	const repoArg = flag(argv, 'repo');
	const stepFilter = flag(argv, 'step');
	const outputDir =
		flag(argv, 'output') ?? join('build', 'ci');
	const dryRun = hasFlag(argv, 'dry-run');

	if (runId === undefined) {
		err('local-repro: --run-id <id> is required');
		return 2;
	}
	if (!/^\d+$/.test(runId)) {
		err(`local-repro: --run-id must be a numeric id, got ${JSON.stringify(runId)}`);
		return 2;
	}

	let repo: IGitHubRepo | null = null;
	if (repoArg !== undefined) {
		const parts = repoArg.split('/');
		const owner = parts[0];
		const repoName = parts[1];
		if (
			parts.length !== 2 ||
			owner === undefined ||
			owner.length === 0 ||
			repoName === undefined ||
			repoName.length === 0
		) {
			err(`local-repro: --repo must be <owner>/<repo>, got ${JSON.stringify(repoArg)}`);
			return 2;
		}
		repo = { owner, repo: repoName };
	} else {
		repo = resolveRepo(process.cwd());
	}
	if (repo === null || repo.owner.length === 0 || repo.repo.length === 0) {
		err('local-repro: could not resolve GitHub repo (set --repo or run inside a checkout with origin pointing at GitHub)');
		return 2;
	}

	if (dryRun) {
		out(
			`local-repro: dry-run — would fetch run ${runId} for ${repo.owner}/${repo.repo}, step="${stepFilter ?? '<auto>'}"`,
		);
		return 0;
	}

	if (hasGhCli() === null) {
		err(
			'local-repro: `gh` CLI not found on PATH. The script can still run with GITHUB_TOKEN set, but `gh auth token` is the preferred fallback.',
		);
		// Continue — the env path still works.
	}

	try {
		const token = resolveToken();
		const jobs = await fetchRunJobs(repo, runId, token);
		const step = selectFailedStep(jobs, stepFilter);
		if (step === null) {
			out(
				`local-repro: run ${runId} has no failed step${stepFilter !== undefined ? ` matching "${stepFilter}"` : ''} (run may already be green)`,
			);
			return 3;
		}
		out(
			`local-repro: will reproduce step "${step.stepName}" (job ${step.jobId} "${step.jobName}")`,
		);
		const report = await reproStep(repo, runId, step, defaultRunner, outputDir);
		out(`local-repro: local log written to ${report.localLogPath}`);
		out(`local-repro: local exit=${report.localStatus} ci exit=${report.ciStatus} matched=${report.matched}`);
		if (report.matched) {
			out('local-repro: ✓ failure reproduces locally');
			return 0;
		}
		out('local-repro: ✗ local run passed — divergence between CI and local env');
		return 1;
	} catch (cause) {
		const reason = cause instanceof Error ? cause.message : String(cause);
		err(`local-repro: ${trim(reason)}`);
		return 1;
	}
};

if (import.meta.main) {
	const code = await main(process.argv.slice(2));
	process.exit(code);
}
