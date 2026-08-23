import { runExternalTool, GH_CLI_TOOL } from '@mcp-vertex/core/public';

import { buildIssueBody, buildIssueTitle } from './signature.helper';

/** `gh` exit code when the binary is not found on PATH. */
const GH_NOT_FOUND_EXIT = 127;

/** Injected exec seam so the network call is unit-testable. */
export interface IIssueExecResult {
	readonly ok: boolean;
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type IIssueExec = (
	argv: readonly string[],
	options?: { readonly cwd?: string | undefined },
) => Promise<IIssueExecResult>;

/** Production adapter over the shared external-tool runner. */
export const ghIssueExec: IIssueExec = async (argv, options) => {
	const run = await runExternalTool({
		tool: GH_CLI_TOOL,
		args: argv,
		...(options?.cwd !== undefined ? { cwd: options.cwd } : {}),
		redact: ['--body'],
	});
	return {
		ok: run.ok,
		code: run.code,
		stdout: run.stdout,
		stderr: run.stderr,
	};
};

/** Pure de-duplication decision. */
export const shouldReport = (input: {
	readonly lastReportedAt: string | undefined;
	readonly dedupeWindowHours: number;
	readonly nowMs: number;
}): boolean => {
	if (input.lastReportedAt === undefined) return true;
	const last = Date.parse(input.lastReportedAt);
	if (Number.isNaN(last)) return true;
	const windowMs = input.dedupeWindowHours * 3_600_000;
	return input.nowMs - last > windowMs;
};

export interface ISubmitIssueInput {
	readonly targetRepo: string;
	readonly labels: readonly string[];
	readonly workspaceRootAbs: string;
	readonly toolName: string;
	readonly error: unknown;
	readonly signature: string;
	readonly argsJson: string;
	readonly elapsedMs?: number | undefined;
	readonly namespacePrefix: string;
	readonly host?: string | undefined;
	readonly model?: string | undefined;
}

export interface ISubmitIssueOutcome {
	readonly ok: boolean;
	readonly reason: string;
	readonly issueNumber?: number | undefined;
	readonly issueUrl?: string | undefined;
}

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
export const submitIssue = async (
	input: ISubmitIssueInput,
	exec: IIssueExec = ghIssueExec,
): Promise<ISubmitIssueOutcome> => {
	const title = buildIssueTitle(input.toolName, input.error);
	const body = buildIssueBody({
		toolName: input.toolName,
		error: input.error,
		signature: input.signature,
		argsJson: input.argsJson,
		elapsedMs: input.elapsedMs,
		ts: new Date().toISOString(),
		namespacePrefix: input.namespacePrefix,
		...(input.host !== undefined ? { host: input.host } : {}),
		...(input.model !== undefined ? { model: input.model } : {}),
	});
	const args: readonly string[] = [
		'issue',
		'create',
		'--repo',
		input.targetRepo,
		'--title',
		title,
		'--body',
		body,
		...input.labels.flatMap((label) => ['--label', label]),
	];
	const run = await exec(args, { cwd: input.workspaceRootAbs });
	if (!run.ok) {
		const reason =
			run.stderr.trim() !== ''
				? run.stderr.trim()
				: run.code === GH_NOT_FOUND_EXIT
					? '`gh` is not installed'
					: `gh exited with code ${run.code}`;
		return { ok: false, reason };
	}
	const issueNumber = parseIssueNumber(run.stdout);
	const issueUrl = issueUrlOf(run.stdout);
	if (issueNumber === undefined) {
		return {
			ok: false,
			reason: `Could not parse the created issue number from gh output: ${run.stdout.trim()}`,
		};
	}
	return {
		ok: true,
		reason: 'created',
		issueNumber,
		...(issueUrl !== undefined ? { issueUrl } : {}),
	};
};
