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
import { isAbsolute, join, resolve } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export interface IRunJob {
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

export interface IGitHubRepo {
	readonly owner: string;
	readonly repo: string;
}

export interface IGhCommandResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
	readonly errorMessage?: string;
}

export type GhRunner = (args: readonly string[]) => IGhCommandResult;

interface ICommandGroup {
	readonly command: string;
	readonly start: number;
	readonly end: number;
}

const out = (msg: string) => process.stdout.write(`${msg}\n`);
const err = (msg: string) => process.stderr.write(`${msg}\n`);

const VALUE_FLAGS = new Set(['run-id', 'repo', 'step', 'output']);

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

const positionalArg = (argv: readonly string[]): string | undefined => {
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		if (token === undefined) continue;
		if (!token.startsWith('--')) return token;
		const equalsIndex = token.indexOf('=');
		if (equalsIndex === -1) {
			const flagName = token.slice(2);
			if (VALUE_FLAGS.has(flagName)) index += 1;
		}
	}
	return undefined;
};

/**
 * Strip comments + trim a CLI flag. Reused so the parse layer
 * has one consistent definition.
 */
const trim = (s: string): string => s.trim();

export const normalizeRunId = (value: string): string | null => {
	const normalized = value.trim();
	if (/^\d+$/.test(normalized)) return normalized;
	const urlMatch = normalized.match(/\/actions\/runs\/(\d+)/);
	return urlMatch?.[1] ?? null;
};

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
	const httpsMatch = url.match(
		/https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
	);
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
	const r = spawnSync('gh', ['--version'], { encoding: 'utf8' });
	if (r.status !== 0) return null;
	return 'gh';
};

export const defaultGhRunner: GhRunner = (args) => {
	const result = spawnSync('gh', [...args], {
		encoding: 'utf8',
		maxBuffer: 1024 * 1024 * 16,
	});
	return {
		status: result.status,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
		...(result.error?.message !== undefined
			? { errorMessage: result.error.message }
			: {}),
	};
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
	ghRunner: GhRunner = defaultGhRunner,
): Promise<string> => {
	const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/jobs/${jobId}/logs`;
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	if (token !== null) headers.Authorization = `Bearer ${token}`;
	const res = await fetcher(url, { headers, redirect: 'follow' });
	if (res.ok) {
		return await res.text();
	}
	const apiError = await res.text();
	const logsFromGh = downloadJobLogsViaGh(repo, jobId, ghRunner);
	if (logsFromGh !== null) return logsFromGh;
	throw new Error(
		`GitHub API ${res.status} on job ${jobId} logs: ${apiError}`,
	);
};

export const downloadJobLogsViaGh = (
	repo: IGitHubRepo,
	jobId: number,
	ghRunner: GhRunner = defaultGhRunner,
): string | null => {
	for (const args of [
		[
			'run',
			'view',
			'--repo',
			`${repo.owner}/${repo.repo}`,
			'--job',
			String(jobId),
			'--log-failed',
		],
		[
			'run',
			'view',
			'--repo',
			`${repo.owner}/${repo.repo}`,
			'--job',
			String(jobId),
			'--log',
		],
	]) {
		const result = ghRunner(args);
		const output = trim(result.stdout);
		if (result.status === 0 && output.length > 0) return result.stdout;
	}
	return null;
};

export const downloadJobLogsFromGhApi = (
	repo: IGitHubRepo,
	jobId: number,
	ghRunner: GhRunner = defaultGhRunner,
): string => {
	const result = ghRunner([
		'api',
		`repos/${repo.owner}/${repo.repo}/actions/jobs/${jobId}/logs`,
		'--header',
		'Accept: application/vnd.github+json',
		'--header',
		'X-GitHub-Api-Version: 2022-11-28',
	]);
	if (result.status !== 0) {
		throw new Error(
			`gh api logs failed: ${result.stderr || result.errorMessage || 'unknown error'}`,
		);
	}
	return result.stdout;
};

interface IParsedLogLine {
	readonly stepName: string | null;
	readonly message: string;
}

const ANSI_ESCAPE_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const stripAnsi = (line: string): string =>
	line.replace(ANSI_ESCAPE_RE, '').replace(/^\uFEFF/, '');

const parseLogLine = (line: string): IParsedLogLine => {
	const cleaned = stripAnsi(line);
	const richMatch = cleaned.match(
		/^(.*?)(?:\t|\s{2,})(.*?)(?:\t|\s{2,})(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s?(.*)$/,
	);
	if (richMatch !== null) {
		return {
			stepName: richMatch[2]?.trim() ?? null,
			message: richMatch[4] ?? '',
		};
	}
	const bareMatch = cleaned.match(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\s?(.*)$/,
	);
	if (bareMatch !== null) {
		return { stepName: null, message: bareMatch[1] ?? '' };
	}
	return { stepName: null, message: cleaned };
};

const looksLikeShellCommand = (line: string): boolean =>
	/^(?:\$\s+)?(?:bunx?|npm|pnpm|yarn|npx|node|bash|sh|git|make|python3?|cargo|go|deno|\.\/|\.\.\/)/.test(
		line,
	);

const collectCommandGroups = (
	lines: readonly string[],
): readonly ICommandGroup[] => {
	const groups: ICommandGroup[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const message = parseLogLine(lines[index] ?? '').message.trim();
		const match = message.match(/^##\[group\]Run\s+(.+)$/);
		if (match?.[1] === undefined) continue;
		const previous = groups.at(-1);
		if (previous !== undefined) {
			groups[groups.length - 1] = { ...previous, end: index };
		}
		groups.push({
			command: trim(match[1]),
			start: index,
			end: lines.length,
		});
	}
	return groups;
};

const findFailureMarkerIndex = (lines: readonly string[]): number =>
	lines.findIndex((line) =>
		parseLogLine(line).message.includes(
			'##[error]Process completed with exit code',
		),
	);

const findFallbackCommandGroup = (
	lines: readonly string[],
): ICommandGroup | null => {
	const groups = collectCommandGroups(lines);
	if (groups.length === 0) return null;
	const failureIndex = findFailureMarkerIndex(lines);
	if (failureIndex !== -1) {
		for (let index = groups.length - 1; index >= 0; index -= 1) {
			const group = groups[index];
			if (group !== undefined && group.start < failureIndex) return group;
		}
	}
	return groups.at(-1) ?? null;
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
	const details = extractStepDetails(logs, stepName);
	if (details !== null) return details.command;

	const lines = logs.split('\n');
	const parsed = lines.map((line) => parseLogLine(line));
	const exactStepLines = parsed.filter(
		(line) => line.stepName?.toLowerCase() === stepName.toLowerCase(),
	);
	if (exactStepLines.length > 0) {
		for (const line of exactStepLines) {
			const groupedCommand = line.message.match(
				/^##\[group\]Run\s+(.+)$/,
			);
			if (groupedCommand?.[1] !== undefined) {
				return trim(groupedCommand[1]);
			}
			if (
				line.message.startsWith('##[') ||
				line.message.startsWith('shell: ')
			) {
				continue;
			}
			if (looksLikeShellCommand(line.message)) {
				return trim(line.message.replace(/^\$\s+/, ''));
			}
		}
		return null;
	}

	const stepStart = lines.findIndex((line) =>
		line.toLowerCase().includes(stepName.toLowerCase()),
	);
	if (stepStart === -1) return null;
	for (let i = stepStart + 1; i < lines.length; i += 1) {
		const stripped = parseLogLine(lines[i] ?? '').message.trim();
		if (stripped.length === 0) continue;
		if (looksLikeShellCommand(stripped)) {
			return stripped.replace(/^\$\s+/, '');
		}
	}
	return null;
};

export const extractStepDetails = (
	logs: string,
	stepName: string,
	defaultWorkingDirectory = '.',
): IStepDetails | null => {
	const lines = logs.split('\n');
	const start = lines.findIndex((line) =>
		line.toLowerCase().includes(stepName.toLowerCase()),
	);
	let workingDirectory = defaultWorkingDirectory;
	let command: string | null = null;
	if (start !== -1) {
		for (
			let index = start;
			index < Math.min(lines.length, start + 40);
			index += 1
		) {
			const parsed = parseLogLine(lines[index] ?? '');
			const message = parsed.message.trim();
			const directory = message.match(/^working-directory:\s*(.+)$/i);
			if (directory?.[1] !== undefined)
				workingDirectory = directory[1].trim();
			const groupedCommand = message.match(/^##\[group\]Run\s+(.+)$/);
			if (groupedCommand?.[1] !== undefined) {
				command ??= trim(groupedCommand[1]);
			}
			if (message.startsWith('##[') || message.startsWith('shell: '))
				continue;
			if (looksLikeShellCommand(message)) {
				command ??= trim(message.replace(/^\$\s+/, ''));
			}
		}
	}
	if (command !== null) return { command, workingDirectory };

	const fallback = findFallbackCommandGroup(lines);
	if (fallback === null) return null;
	workingDirectory = defaultWorkingDirectory;
	for (
		let index = fallback.start;
		index < Math.min(lines.length, fallback.end + 1, fallback.start + 40);
		index += 1
	) {
		const message = parseLogLine(lines[index] ?? '').message.trim();
		const directory = message.match(/^working-directory:\s*(.+)$/i);
		if (directory?.[1] !== undefined) {
			workingDirectory = directory[1].trim();
		}
	}
	return {
		command: fallback.command,
		workingDirectory,
	};
};

export interface IRunnerResult {
	readonly status: number | null;
	readonly stdout: string;
	readonly stderr: string;
}

export interface IStepDetails {
	readonly command: string;
	readonly workingDirectory: string;
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
): Promise<IRunnerResult> => {
	if (/[;&|<>`$]/.test(command)) {
		return Promise.reject(
			new Error('refusing command containing shell operators'),
		);
	}
	const argv = command.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
	const unquoted = argv.map((token) => token.replace(/^(['"])(.*)\1$/, '$2'));
	if (typeof Bun === 'undefined') {
		return new Promise((resolveFn) => {
			const child = spawn(unquoted[0] ?? '', unquoted.slice(1), {
				cwd,
				env: { ...process.env, CI_REPRO: '1' },
			});
			const stdoutChunks: Buffer[] = [];
			const stderrChunks: Buffer[] = [];
			child.stdout?.on('data', (chunk: Buffer) =>
				stdoutChunks.push(chunk),
			);
			child.stderr?.on('data', (chunk: Buffer) =>
				stderrChunks.push(chunk),
			);
			child.on('close', (status) =>
				resolveFn({
					status,
					stdout: Buffer.concat(stdoutChunks).toString('utf8'),
					stderr: Buffer.concat(stderrChunks).toString('utf8'),
				}),
			);
		});
	}
	const child = Bun.spawn(unquoted, {
		cwd,
		stdout: 'pipe',
		stderr: 'pipe',
		env: { ...process.env, CI_REPRO: '1' },
	});
	return Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]).then(([stdout, stderr, status]) => ({ status, stdout, stderr }));
};

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
	readonly command: string;
	readonly workingDirectory: string;
	readonly diffSummary: string;
}

export const fetchRunJobsViaGh = (
	repo: IGitHubRepo,
	runId: string,
	ghRunner: GhRunner = defaultGhRunner,
): readonly IRunJob[] => {
	const result = ghRunner([
		'api',
		`repos/${repo.owner}/${repo.repo}/actions/runs/${runId}/jobs?per_page=100`,
		'--header',
		'Accept: application/vnd.github+json',
		'--header',
		'X-GitHub-Api-Version: 2022-11-28',
	]);
	if (result.status !== 0) {
		throw new Error(
			`gh api jobs failed: ${result.stderr || result.errorMessage || 'unknown error'}`,
		);
	}
	const body = JSON.parse(result.stdout) as { jobs?: readonly IRunJob[] };
	return body.jobs ?? [];
};

export const summarizeDiff = (ciLog: string, localLog: string): string => {
	const ciLines = ciLog.split(/\r?\n/).filter((line) => line.trim() !== '');
	const localLines = localLog
		.split(/\r?\n/)
		.filter((line) => line.trim() !== '');
	let matchingLines = 0;
	for (
		let index = 0;
		index < Math.min(ciLines.length, localLines.length);
		index += 1
	) {
		if (ciLines[index] === localLines[index]) matchingLines += 1;
	}
	const differingLines =
		Math.max(ciLines.length, localLines.length) - matchingLines;
	return `diff: ${differingLines} differing line(s), ${matchingLines} matching line(s), CI=${ciLines.length}, local=${localLines.length}`;
};

export const reproStepFromGh = async (
	repo: IGitHubRepo,
	runId: string,
	step: IFailedStep,
	runner: Runner,
	outputDir: string,
	ghRunner: GhRunner = defaultGhRunner,
): Promise<IReproReport> => {
	const ciLogs = downloadJobLogsFromGhApi(repo, step.jobId, ghRunner);
	const details = extractStepDetails(ciLogs, step.stepName);
	if (details === null) {
		throw new Error(
			`Could not extract a runnable command from step "${step.stepName}" in job ${step.jobId}`,
		);
	}
	const root = repoRoot();
	const workingDirectory = resolve(
		root,
		isAbsolute(details.workingDirectory) ? '.' : details.workingDirectory,
	);
	const local = await runner(details.command, workingDirectory);
	const localContent = `${local.stdout}${local.stderr.length > 0 ? `\n--- stderr ---\n${local.stderr}` : ''}`;
	mkdirSync(outputDir, { recursive: true });
	const localLogPath = join(outputDir, `local-repro-${runId}.log`);
	writeFileSync(localLogPath, localContent);
	return {
		localStatus: local.status,
		ciStatus: 1,
		matched: local.status !== 0,
		localLogPath,
		command: details.command,
		workingDirectory,
		diffSummary: summarizeDiff(ciLogs, localContent),
	};
};

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
	const details = extractStepDetails(ciLogs, step.stepName);
	if (details === null) {
		throw new Error(
			`Could not extract a runnable command from step "${step.stepName}" in job ${step.jobId}`,
		);
	}
	const root = repoRoot();
	const workingDirectory = resolve(
		root,
		isAbsolute(details.workingDirectory) ? '.' : details.workingDirectory,
	);
	const local = await runner(details.command, workingDirectory);
	const localContent = `${local.stdout}${local.stderr.length > 0 ? `\n--- stderr ---\n${local.stderr}` : ''}`;
	mkdirSync(outputDir, { recursive: true });
	const localLogPath = join(outputDir, `local-repro-${runId}.log`);
	writeFileSync(localLogPath, localContent);
	return {
		localStatus: local.status,
		ciStatus: 1,
		matched: local.status !== 0,
		localLogPath,
		command: details.command,
		workingDirectory,
		diffSummary: summarizeDiff(ciLogs, localContent),
	};
};

export const main = async (argv: readonly string[]): Promise<number> => {
	const runIdInput = flag(argv, 'run-id') ?? positionalArg(argv);
	const repoArg = flag(argv, 'repo');
	const stepFilter = flag(argv, 'step');
	const outputDir = flag(argv, 'output') ?? join('build', 'ci');
	const dryRun = hasFlag(argv, 'dry-run');

	if (runIdInput === undefined) {
		err(
			'local-repro: provide a run id or GitHub Actions run URL via --run-id <id> or as the first positional argument',
		);
		return 2;
	}
	const runId = normalizeRunId(runIdInput);
	if (runId === null) {
		err(
			`local-repro: run id must be a numeric id or GitHub Actions run URL, got ${JSON.stringify(runIdInput)}`,
		);
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
			err(
				`local-repro: --repo must be <owner>/<repo>, got ${JSON.stringify(repoArg)}`,
			);
			return 2;
		}
		repo = { owner, repo: repoName };
	} else {
		repo = resolveRepo(process.cwd());
	}
	if (repo === null || repo.owner.length === 0 || repo.repo.length === 0) {
		err(
			'local-repro: could not resolve GitHub repo (set --repo or run inside a checkout with origin pointing at GitHub)',
		);
		return 2;
	}

	if (dryRun) {
		out(
			`local-repro: dry-run — would fetch run ${runId} for ${repo.owner}/${repo.repo}, step="${stepFilter ?? '<auto>'}"`,
		);
		return 0;
	}

	const ghCli = hasGhCli();
	const token = resolveToken();
	if (ghCli === null && token === null) {
		err(
			'local-repro: neither `gh` CLI nor GITHUB_TOKEN/`gh auth token` is available, so the script cannot download the CI run',
		);
		return 2;
	}
	if (ghCli === null) {
		err(
			'local-repro: `gh` CLI not found on PATH; falling back to GitHub REST API with GITHUB_TOKEN/`gh auth token`.',
		);
	}

	try {
		const jobs =
			ghCli === null
				? await fetchRunJobs(repo, runId, token)
				: fetchRunJobsViaGh(repo, runId);
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
		const report =
			ghCli === null
				? await reproStep(repo, runId, step, defaultRunner, outputDir)
				: await reproStepFromGh(
						repo,
						runId,
						step,
						defaultRunner,
						outputDir,
					);
		out(`local-repro: extracted command ${JSON.stringify(report.command)}`);
		out(
			`local-repro: working-directory ${JSON.stringify(report.workingDirectory)}`,
		);
		out(`local-repro: local log written to ${report.localLogPath}`);
		out(
			`local-repro: local exit=${report.localStatus} ci exit=${report.ciStatus} matched=${report.matched}`,
		);
		out(`local-repro: ${report.diffSummary}`);
		if (report.matched) {
			out('local-repro: ✓ failure reproduces locally');
			return 0;
		}
		out(
			'local-repro: ✗ local run passed — divergence between CI and local env',
		);
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
