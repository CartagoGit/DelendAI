/**
 * agent-lock-session-store.ts
 *
 * Durable JSONL session balance store for `agent_lock` claim/release
 * telemetry. The engine appends one line per successful claim/release,
 * and readers derive the aggregate balance from the full file so the
 * counter survives MCP-server restarts.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { cwd } from 'node:process';
import { dirname, join } from 'node:path';

import { writeFileAtomic, withFileMutex } from '@mcp-vertex/core/public';

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

const EMPTY_BALANCE = (): ISessionBalance => ({
	claims: 0,
	releases: 0,
	imbalance: 0,
});

let cachedBalance: ISessionBalance | null = null;
let cachedPath: string | null = null;

export const sessionLogPath = (workspaceRootAbs?: string): string =>
	join(
		workspaceRootAbs ?? cwd(),
		'.cache/mcp-vertex',
		'agents.lock.session.jsonl',
	);

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
		} catch {
			continue;
		}
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
	cachedBalance = balance;
	return balance;
};

const readSessionBalanceFromFile = (path: string): ISessionBalance => {
	try {
		return updateCache(path, deriveBalance(readFileSync(path, 'utf8')));
	} catch {
		return updateCache(path, EMPTY_BALANCE());
	}
};

export const appendSessionEntry = async (
	entry: ISessionEntry,
	workspaceRootAbs?: string,
): Promise<void> => {
	const path = sessionLogPath(workspaceRootAbs);
	await withFileMutex(path, async () => {
		await mkdir(dirname(path), { recursive: true });
		const prefix = await readFile(path, 'utf8').catch(() => '');
		await writeFileAtomic(path, `${prefix}${JSON.stringify(entry)}\n`);
		updateCache(path, deriveBalance(`${prefix}${JSON.stringify(entry)}\n`));
	});
};

export const readSessionBalance = async (
	workspaceRootAbs?: string,
): Promise<ISessionBalance> => {
	const path = sessionLogPath(workspaceRootAbs);
	try {
		return updateCache(path, deriveBalance(await readFile(path, 'utf8')));
	} catch {
		return updateCache(path, EMPTY_BALANCE());
	}
};

export const readSessionBalanceSync = (
	workspaceRootAbs?: string,
): ISessionBalance =>
	readSessionBalanceFromFile(sessionLogPath(workspaceRootAbs));

export const resetSessionBalance = (): void => {
	if (cachedPath !== null) {
		mkdirSync(dirname(cachedPath), { recursive: true });
	}
	cachedBalance = null;
	cachedPath = null;
};
