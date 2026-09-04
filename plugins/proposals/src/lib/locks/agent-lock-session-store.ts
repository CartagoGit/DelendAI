/**
 * agent-lock-session-store.ts
 *
 * Durable JSONL session balance store for `agent_lock` claim/release
 * telemetry. The engine appends one line per successful claim/release,
 * and readers derive the aggregate balance from the full file so the
 * counter survives MCP-server restarts.
 */

import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	writeFileAtomic,
	withFileMutex,
} from '@delendai/core/public';
import { EMPTY_BALANCE } from '../contracts/constants/agent-lock-engine.constant';

export interface ISessionEntry {
	readonly ts: string;
	readonly agent: string;
	action: 'claim' | 'release';
	readonly ok: boolean;
}

export interface ISessionBalance {
	readonly claims: number;
	readonly releases: number;
	readonly imbalance: number;
}

// r00042 follow-up: the zero balance is single-sourced in
// `contracts/constants/agent-lock-engine.constant.ts`. Spread it rather
// than sharing the object — callers build on the result.
const emptyBalance = (): ISessionBalance => ({ ...EMPTY_BALANCE });

/**
 * x00154 S6 — typed error thrown by `appendSessionEntry` when the
 * existing session log cannot be read for any reason other than
 * `ENOENT` (no log yet). The previous `.catch(() => '')` collapsed
 * permissions failures, EIO, and "log is gone" into a single silent
 * overwrite path, which could destroy the durable counter. Callers
 * surface this to the tool envelope as a `lock-store-unreadable`
 * failure so the operator can decide whether to retry or escalate.
 */
export class SessionLogUnreadableError extends Error {
	readonly path: string;
	override readonly cause: unknown;
	constructor(path: string, cause: unknown) {
		super(`session log is not readable: ${path}`);
		this.name = 'SessionLogUnreadableError';
		this.path = path;
		this.cause = cause;
	}
}

const isMissingFileErrno = (err: unknown): boolean => {
	// x00154 S6 — only ENOENT is the legitimate "first append" case.
	// ENOTDIR (parent path is a file) and EACCES/EIO/… are real
	// read failures that must not silently become an empty prefix
	// that overwrites the durable counter.
	if (typeof err !== 'object' || err === null) return false;
	const code = (err as { code?: unknown }).code;
	return code === 'ENOENT';
};

const readSessionLogPrefix = async (path: string): Promise<string> => {
	try {
		return (
			await new SafeWorkspaceReader(dirname(path)).readText(
				basename(path),
			)
		).content;
	} catch (err) {
		// x00154 S6 — a missing log is the normal "first append"
		// case. Any other read failure is a real problem and must
		// not silently become an empty prefix that overwrites the
		// durable counter.
		if (isMissingFileErrno(err)) return '';
		throw new SessionLogUnreadableError(path, err);
	}
};

let _cachedBalance: ISessionBalance | null = null;
let cachedPath: string | null = null;

/**
 * Resolve the absolute path of the session log for a workspace.
 *
 * f00154 S2 audit: the previous version fell back to `process.cwd()`
 * when the caller omitted `workspaceRootAbs`. That violated AGENTS.md
 * ("no `process.cwd()`") and silently wrote session logs to whatever
 * directory the host happened to be cwd'd to — a real bug in CI /
 * orchestrator scenarios where the MCP server is launched from a
 * different cwd than the consumer workspace. The function now refuses
 * to compute a path without an explicit workspace root; callers
 * without one must pass `null`/throw a typed error rather than
 * contaminating the host cwd.
 */
export const sessionLogPath = (workspaceRootAbs: string): string => {
	if (typeof workspaceRootAbs !== 'string' || workspaceRootAbs.length === 0) {
		throw new Error(
			'agent-lock-session-store: sessionLogPath requires a non-empty workspaceRootAbs. ' +
				'Passing undefined / process.cwd() fallback is forbidden — see AGENTS.md.',
		);
	}
	return join(
		workspaceRootAbs,
		'.cache/delendai',
		'agents.lock.session.jsonl',
	);
};

const isSessionEntry = (value: unknown): value is ISessionEntry => {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Record<string, unknown>;
	return (
		typeof candidate.ts === 'string' &&
		typeof candidate.agent === 'string' &&
		(candidate.action === 'claim' || candidate.action === 'release') &&
		typeof candidate.ok === 'boolean'
	);
};

const deriveBalance = (text: string): ISessionBalance => {
	const balance = { claims: 0, releases: 0, imbalance: 0 };
	for (const line of text.split('\n')) {
		const trimmed = line.trim();
		if (trimmed.length === 0) continue;
		try {
			const parsed = JSON.parse(trimmed) as unknown;
			if (!isSessionEntry(parsed) || parsed.ok !== true) continue;
			if (parsed.action === 'claim') balance.claims += 1;
			if (parsed.action === 'release') balance.releases += 1;
		} catch {}
	}
	return {
		claims: balance.claims,
		releases: balance.releases,
		imbalance: balance.claims - balance.releases,
	};
};

const updateCache = (
	path: string,
	balance: ISessionBalance,
): ISessionBalance => {
	cachedPath = path;
	_cachedBalance = balance;
	return balance;
};

const readSessionBalanceFromFile = async (
	path: string,
): Promise<ISessionBalance> => {
	try {
		const text = (
			await new SafeWorkspaceReader(dirname(path)).readText(
				basename(path),
			)
		).content;
		return updateCache(path, deriveBalance(text));
	} catch {
		return updateCache(path, emptyBalance());
	}
};

export const appendSessionEntry = async (
	entry: ISessionEntry,
	workspaceRootAbs: string,
): Promise<void> => {
	const path = sessionLogPath(workspaceRootAbs);
	await withFileMutex(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const prefix = await readSessionLogPrefix(path);
		await writeFileAtomic(path, `${prefix}${JSON.stringify(entry)}\n`);
		updateCache(path, deriveBalance(`${prefix}${JSON.stringify(entry)}\n`));
	});
};

export const readSessionBalance = async (
	workspaceRootAbs: string,
): Promise<ISessionBalance> => {
	const path = sessionLogPath(workspaceRootAbs);
	try {
		return updateCache(
			path,
			deriveBalance(
				(
					await new SafeWorkspaceReader(dirname(path)).readText(
						basename(path),
					)
				).content,
			),
		);
	} catch {
		return updateCache(path, emptyBalance());
	}
};

export const readSessionBalanceSync = async (
	workspaceRootAbs: string,
): Promise<ISessionBalance> =>
	readSessionBalanceFromFile(sessionLogPath(workspaceRootAbs));

export const resetSessionBalance = async (): Promise<void> => {
	if (cachedPath !== null) {
		await mkdir(dirname(cachedPath), { recursive: true });
	}
	_cachedBalance = null;
	cachedPath = null;
};
