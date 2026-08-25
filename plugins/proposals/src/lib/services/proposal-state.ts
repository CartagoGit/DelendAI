/**
 * proposal-state.ts
 *
 * Local transition guards and audit logging that sit above the raw DFA.
 *
 * These rules intentionally do not redefine the full lifecycle graph.
 * They only harden the exceptional paths that the transition/recovery tools
 * must treat specially.
 */

import { mkdir } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

export type IDoneToReviewRegressionResult =
	| { ok: true }
	| { ok: false; code: 'invalid-regression'; reason: string };

export const guardDoneToReviewRegression = (input: {
	readonly from: string;
	readonly to: string;
	readonly force?: boolean | undefined;
	readonly reason?: string | undefined;
}): IDoneToReviewRegressionResult => {
	if (input.from !== 'done' || input.to !== 'review') return { ok: true };
	if (input.force !== true) {
		return {
			ok: false,
			code: 'invalid-regression',
			reason: 'cannot move done -> review without force: true',
		};
	}
	if ((input.reason ?? '').trim() === '') {
		return {
			ok: false,
			code: 'invalid-regression',
			reason: 'force: true requires a non-empty reason',
		};
	}
	return { ok: true };
};

export type IShippedInGuardResult =
	| { ok: true }
	| { ok: false; code: 'missing-shipped-in'; reason: string };

export const guardShippedInPresent = (
	proposalFrontmatter: Record<string, unknown>,
): IShippedInGuardResult => {
	const shippedIn = proposalFrontmatter['shipped-in'];
	if (!Array.isArray(shippedIn)) {
		return {
			ok: false,
			code: 'missing-shipped-in',
			reason: 'shipped-in: list is required to mark a proposal done',
		};
	}
	const shas = shippedIn.filter(
		(value): value is string =>
			typeof value === 'string' && value.trim().length > 0,
	);
	if (shas.length === 0) {
		return {
			ok: false,
			code: 'missing-shipped-in',
			reason: 'shipped-in: list is required to mark a proposal done',
		};
	}
	return { ok: true };
};

export interface IForcedRegressionCaller {
	readonly host: string;
	readonly pid: number;
	readonly agent: string;
}

export const buildForcedRegressionCaller = (
	agent?: string | undefined,
): IForcedRegressionCaller => ({
	host: process.env.MCP_HOST ?? hostname(),
	pid: process.pid,
	agent: agent?.trim() || 'unknown',
});

export const logForcedRegression = async (input: {
	readonly workspaceRoot: string;
	readonly proposalId: string;
	readonly from: string;
	readonly to: string;
	readonly reason: string;
	readonly ts: string;
	readonly caller: IForcedRegressionCaller;
}): Promise<void> => {
	const logPath = join(
		input.workspaceRoot,
		'.cache',
		'mcp-vertex',
		'proposals-state.log',
	);
	const line = JSON.stringify({
		proposalId: input.proposalId,
		from: input.from,
		to: input.to,
		reason: input.reason,
		ts: input.ts,
		caller: input.caller,
	});

	await mkdir(dirname(logPath), { recursive: true });
	await withFileMutex(logPath, async () => {
		const existing = await new SafeWorkspaceReader(dirname(logPath))
			.readText(basename(logPath))
			.then((value) => value.content)
			.catch((error: unknown) => {
				if (
					error &&
					typeof error === 'object' &&
					'code' in error &&
					error.code === 'ENOENT'
				) {
					return '';
				}
				throw error;
			});
		const prefix =
			existing === '' || existing.endsWith('\n')
				? existing
				: `${existing}\n`;
		await writeFileAtomic(logPath, `${prefix}${line}\n`);
	});
};
