import { runGhCli } from '@delendai/core/public';

import {
	DEFAULT_LABELS,
	DEFAULT_TARGET_REPO,
} from './contracts/constants/options.constant';

import type {
	IIssueExec,
	ISafeMcpVertexReport,
	ISafeReporter,
	ISafeReporterConfig,
	ISubmitIssueOutcome,
} from './contracts/interfaces/reporter.interface';
import { buildIssueBody, buildIssueTitle } from './signature.helper';

/** `gh` exit code when the binary is not found on PATH. */
const GH_NOT_FOUND_EXIT = 127;
const NETWORK_PROBE_URL = 'https://api.github.com/';
const NETWORK_PROBE_TIMEOUT_MS = 2_000;

const defaultNetworkProbe = async (): Promise<boolean> => {
	if (typeof fetch !== 'function' || typeof AbortController !== 'function') {
		return false;
	}
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		NETWORK_PROBE_TIMEOUT_MS,
	);
	try {
		const response = await fetch(NETWORK_PROBE_URL, {
			method: 'HEAD',
			signal: controller.signal,
		});
		return (
			response.ok || response.status === 401 || response.status === 403
		);
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
};

/** Production adapter over the shared external-tool runner. */
export const ghIssueExec: IIssueExec = async (argv, options) =>
	runGhCli(argv, options);

/** Pure de-duplication decision. */
export const shouldReport = (input: {
	readonly lastSuccessAt: string | undefined;
	readonly dedupeWindowHours: number;
	readonly nowMs: number;
}): boolean => {
	if (input.lastSuccessAt === undefined) return true;
	const last = Date.parse(input.lastSuccessAt);
	if (Number.isNaN(last)) return true;
	const windowMs = input.dedupeWindowHours * 3_600_000;
	return input.nowMs - last > windowMs;
};

const parseIssueNumber = (stdout: string): number | undefined => {
	const match = /\/issues\/(\d+)/.exec(stdout);
	if (match?.[1] === undefined) return undefined;
	const number = Number(match[1]);
	return Number.isFinite(number) ? number : undefined;
};

const issueUrlOf = (stdout: string): string | undefined => {
	const match = /https:\/\/[^\s]+/.exec(stdout);
	return match?.[0];
};

/**
 * Create one issue on `targetRepo` via `gh issue create`. Returns a
 * structured outcome; never throws — a missing `gh`, unauthenticated
 * session or offline machine all collapse into `{ ok: false, reason }`
 * and the caller decides whether to keep the failure quiet.
 */
export const createSafeReporter = (
	config: ISafeReporterConfig,
): ISafeReporter => ({
	submitSafeReport: async (
		report: ISafeMcpVertexReport,
		exec: IIssueExec = ghIssueExec,
	): Promise<ISubmitIssueOutcome> => {
		const connected = await (config.networkProbe ?? defaultNetworkProbe)();
		if (!connected) {
			return {
				ok: false,
				reason: 'GitHub is unreachable; issue creation was not attempted',
				failureCode: 'NETWORK_UNAVAILABLE',
			};
		}
		const title = buildIssueTitle(report);
		const body = buildIssueBody(report);
		const args: readonly string[] = [
			'issue',
			'create',
			'--repo',
			DEFAULT_TARGET_REPO,
			'--title',
			title,
			'--body',
			body,
			...DEFAULT_LABELS.flatMap((label) => ['--label', label]),
		];
		const run = await exec(args, { cwd: config.workspaceRootAbs });
		if (!run.ok) {
			const reason =
				run.stderr.trim() !== ''
					? run.stderr.trim()
					: run.code === GH_NOT_FOUND_EXIT
						? '`gh` is not installed'
						: `gh exited with code ${run.code}`;
			return {
				ok: false,
				reason,
				failureCode:
					run.code === GH_NOT_FOUND_EXIT
						? 'GH_NOT_INSTALLED'
						: 'GH_EXEC_FAILED',
			};
		}
		const issueNumber = parseIssueNumber(run.stdout);
		const issueUrl = issueUrlOf(run.stdout);
		if (issueNumber === undefined) {
			return {
				ok: false,
				reason: `Could not parse the created issue number from gh output: ${run.stdout.trim()}`,
				failureCode: 'ISSUE_NUMBER_PARSE_FAILED',
			};
		}
		return {
			ok: true,
			reason: 'created',
			issueNumber,
			...(issueUrl !== undefined ? { issueUrl } : {}),
		};
	},
});
