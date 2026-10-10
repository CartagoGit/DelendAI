/**
 * forge-seam.service.ts — the host's read-only window onto the forge.
 *
 * WHY it lives in the host and not in core: core stays forge-agnostic
 * and only declares what it needs to know. Which forge answers, and
 * through which CLI, is a fact about THIS host.
 *
 * WHY it shells out to the forge CLI: delendai never reads, prints or
 * passes a credential. The CLI authenticates from the user's own
 * session, and when it cannot (missing, signed out, offline) the answer
 * is `unavailable` with a reason — a boot is never aborted by the forge,
 * and nothing is inferred from a read that did not happen.
 */

import { execFile } from 'node:child_process';

import type {
	IForgeCheckRun,
	IForgePullRequest,
	IForgeRead,
	IStartupForgeSeam,
} from '@delendai/core/cli';

import {
	CHECK_STATE_BY_CONCLUSION,
	FORGE_CLI,
	FORGE_MAX_BUFFER_BYTES,
	FORGE_PAGE_SIZE,
	FORGE_REQUEST_TIMEOUT_MS,
	HTTP_NOT_MODIFIED,
	HTTP_UNKNOWN_COMMIT,
	HTTP_OK,
	HTTP_SUCCESS_CEILING,
	HTTP_SUCCESS_FLOOR,
	UNKNOWN_CHECK_WORKFLOW,
} from './forge-seam.constant';
import type {
	IForgeCommandResult,
	IForgeCommandRunner,
	IForgeSeamOptions,
	IParsedForgeResponse,
	IRawCheckRun,
	IRawPullRequest,
} from './forge-seam.interface';

export type {
	IForgeCommandResult,
	IForgeCommandRunner,
	IForgeSeamOptions,
} from './forge-seam.interface';

/** The real runner: async, bounded by a timeout, never throws. */
export const createForgeCliRunner =
	(cwd: string): IForgeCommandRunner =>
	(args) =>
		new Promise<IForgeCommandResult>((resolve) => {
			execFile(
				FORGE_CLI,
				[...args],
				{
					cwd,
					timeout: FORGE_REQUEST_TIMEOUT_MS,
					maxBuffer: FORGE_MAX_BUFFER_BYTES,
				},
				(error, stdout, stderr) => {
					if (error === null) {
						resolve({ exitCode: 0, stdout, stderr });
						return;
					}
					const code: unknown = (error as { code?: unknown }).code;
					resolve({
						exitCode: typeof code === 'number' ? code : undefined,
						stdout: stdout ?? '',
						stderr: stderr ?? '',
						...(typeof code === 'number'
							? {}
							: { spawnError: error.message }),
					});
				},
			);
		});

const STATUS_LINE = /^HTTP\/\S+\s+(\d{3})/u;
const HEADER_BODY_SPLIT = /\r?\n\r?\n/u;

/** Split `gh api -i` output into status, ETag and body; undefined when no headers came back. */
const parseResponse = (stdout: string): IParsedForgeResponse | undefined => {
	const [head = '', ...rest] = stdout.split(HEADER_BODY_SPLIT);
	const lines = head.split(/\r?\n/u);
	const match = STATUS_LINE.exec(lines[0] ?? '');
	if (match === null) return undefined;
	const etagLine = lines.find((line) => /^etag:/iu.test(line));
	const etag = etagLine?.slice(etagLine.indexOf(':') + 1).trim();
	return {
		status: Number(match[1]),
		...(etag === undefined || etag.length === 0 ? {} : { etag }),
		body: rest.join('\n\n'),
	};
};

const failureReason = (result: IForgeCommandResult): string => {
	if (result.spawnError !== undefined) {
		return `the forge CLI could not run (${result.spawnError})`;
	}
	const detail = result.stderr.trim().split(/\r?\n/u)[0] ?? '';
	return detail.length > 0
		? `the forge CLI failed: ${detail}`
		: 'the forge CLI failed without a message';
};

const toPullRequest = (raw: IRawPullRequest): IForgePullRequest | undefined => {
	if (
		raw.number === undefined ||
		raw.head?.ref === undefined ||
		raw.head.sha === undefined ||
		raw.base?.ref === undefined
	) {
		return undefined;
	}
	return {
		number: raw.number,
		headRef: raw.head.ref,
		baseRef: raw.base.ref,
		headSha: raw.head.sha,
		state: raw.draft === true ? 'draft' : 'open',
		...(raw.merge_commit_sha == null
			? {}
			: { mergeSha: raw.merge_commit_sha }),
	};
};

const epoch = (value: string | null | undefined): number | undefined => {
	if (value == null) return undefined;
	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? undefined : parsed;
};

const toCheckRun = (
	sha: string,
	raw: IRawCheckRun,
): IForgeCheckRun | undefined => {
	if (raw.name === undefined) return undefined;
	const state: IForgeCheckRun['state'] =
		raw.status === 'completed'
			? (CHECK_STATE_BY_CONCLUSION[raw.conclusion ?? ''] ?? 'neutral')
			: raw.status === 'in_progress'
				? 'in_progress'
				: 'queued';
	const startedAt = epoch(raw.started_at);
	const completedAt = epoch(raw.completed_at);
	return {
		candidateSha: sha,
		workflow: raw.app?.slug ?? UNKNOWN_CHECK_WORKFLOW,
		checkName: raw.name,
		...(raw.id === undefined ? {} : { externalId: String(raw.id) }),
		state,
		...(startedAt === undefined ? {} : { startedAt }),
		...(completedAt === undefined ? {} : { completedAt }),
	};
};

const parseJson = (body: string): unknown => {
	try {
		return JSON.parse(body) as unknown;
	} catch {
		return undefined;
	}
};

/** Read-only forge access through the user's own CLI session. */
export const createForgeSeam = (
	options: IForgeSeamOptions,
): IStartupForgeSeam => {
	const { repositorySlug, run } = options;

	const listPullRequests: IStartupForgeSeam['listPullRequests'] = async (
		request,
	): Promise<IForgeRead<readonly IForgePullRequest[]>> => {
		const conditional =
			request.etag === undefined
				? []
				: ['-H', `If-None-Match: ${request.etag}`];
		const result = await run([
			'api',
			'-i',
			...conditional,
			`repos/${repositorySlug}/pulls?state=open&per_page=${String(FORGE_PAGE_SIZE)}`,
		]);
		const response = parseResponse(result.stdout);
		if (response === undefined) {
			return { kind: 'unavailable', reason: failureReason(result) };
		}
		if (response.status === HTTP_NOT_MODIFIED) {
			return { kind: 'not-modified' };
		}
		if (response.status !== HTTP_OK) {
			return {
				kind: 'unavailable',
				reason: `the forge answered HTTP ${String(response.status)}`,
			};
		}
		const parsed = parseJson(response.body);
		if (!Array.isArray(parsed)) {
			return {
				kind: 'unavailable',
				reason: 'the forge answered a body that is not a list',
			};
		}
		const payload = (parsed as IRawPullRequest[])
			.map(toPullRequest)
			.filter((pull): pull is IForgePullRequest => pull !== undefined);
		return {
			kind: 'payload',
			payload,
			...(response.etag === undefined ? {} : { etag: response.etag }),
		};
	};

	const listCheckRuns: IStartupForgeSeam['listCheckRuns'] = async (
		request,
	): Promise<IForgeRead<readonly IForgeCheckRun[]>> => {
		const runs: IForgeCheckRun[] = [];
		for (const sha of request.shas) {
			const result = await run([
				'api',
				'-i',
				`repos/${repositorySlug}/commits/${sha}/check-runs?per_page=${String(FORGE_PAGE_SIZE)}`,
			]);
			const response = parseResponse(result.stdout);
			if (response === undefined) {
				return { kind: 'unavailable', reason: failureReason(result) };
			}
			// A commit only this machine has (a unit not pushed yet) is not
			// on the forge, which says so with 422: it has no runs, and the
			// boot is not degraded for asking. A 404 stays unavailable: it is
			// also how the forge answers a repository it will not show.
			if (response.status === HTTP_UNKNOWN_COMMIT) continue;
			if (
				response.status < HTTP_SUCCESS_FLOOR ||
				response.status >= HTTP_SUCCESS_CEILING
			) {
				return {
					kind: 'unavailable',
					reason: `the forge answered HTTP ${String(response.status)} for ${sha}`,
				};
			}
			const parsed = parseJson(response.body) as
				| { check_runs?: IRawCheckRun[] }
				| undefined;
			for (const raw of parsed?.check_runs ?? []) {
				const mapped = toCheckRun(sha, raw);
				if (mapped !== undefined) runs.push(mapped);
			}
		}
		return { kind: 'payload', payload: runs };
	};

	return { listPullRequests, listCheckRuns };
};
