/**
 * quota-ledger.helper.ts — the quota reservation ledger on disk: read,
 * written whole, and refused when it cannot be read.
 *
 * effect-boundary-authorized: the machine-wide ledger lives outside any workspace, so ctx.effects cannot reach it
 */
import { appendFile, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import type {
	ILedger,
	ISpentReservation,
} from '../contracts/interfaces/quota-ledger.interface';
import type { IQuotaReservation } from '../contracts/interfaces/quota-reservation.interface';
import {
	QUOTA_LEDGER_FILE,
	QUOTA_LEDGER_VARIABLE,
} from '../contracts/constants/quota-ledger.constant';
import { readCacheFile } from './read-cache-file.helper';

const LEDGER_SCHEMA = 'delendai/orchestrator-runner/quota-reservations/1';

export const readLedger = async (
	path: string,
): Promise<ILedger | 'corrupt'> => {
	let raw: string | undefined;
	try {
		raw = await readCacheFile(path);
	} catch {
		return 'corrupt';
	}
	if (raw === undefined) return { reservations: [], history: [] };
	try {
		const parsed = JSON.parse(raw) as {
			schema?: unknown;
			reservations?: unknown;
			history?: unknown;
		};
		if (
			parsed.schema !== LEDGER_SCHEMA ||
			!Array.isArray(parsed.reservations)
		)
			return 'corrupt';
		const blockedUntil = (parsed as { blockedUntil?: unknown })
			.blockedUntil;
		return {
			reservations: parsed.reservations as IQuotaReservation[],
			history: Array.isArray(parsed.history)
				? (parsed.history as ISpentReservation[])
				: [],
			...(typeof blockedUntil === 'string' ? { blockedUntil } : {}),
		};
	} catch {
		return 'corrupt';
	}
};

export const writeLedger = (
	path: string,
	reservations: readonly IQuotaReservation[],
	history: readonly ISpentReservation[],
	blockedUntil?: string | undefined,
) =>
	writeFileAtomic(
		path,
		`${JSON.stringify(
			{
				schema: LEDGER_SCHEMA,
				reservations,
				history,
				...(blockedUntil === undefined ? {} : { blockedUntil }),
			},
			null,
			'\t',
		)}\n`,
	);

/** The machine's ledger: one for every workspace, since quota is the account's. */
export const machineLedgerPath = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const declared = env[QUOTA_LEDGER_VARIABLE]?.trim();
	return declared !== undefined && declared.length > 0
		? declared
		: join(homedir(), '.cache', 'delendai', QUOTA_LEDGER_FILE);
};

/**
 * Move a workspace's own ledger into the machine's, once: its live
 * reservations and its history join the machine's (an invocation already
 * there is kept once), the workspace file goes, and the move is journalled.
 * A workspace ledger that cannot be read is left where it is and said so;
 * nothing is lost by the move. Never throws.
 */
export const adoptWorkspaceLedger = async (input: {
	readonly workspaceLedger: string;
	readonly machineLedger: string;
	readonly journal: string;
	readonly now?: (() => number) | undefined;
}): Promise<'none' | 'adopted' | 'unreadable'> => {
	const legacy = await readLedger(input.workspaceLedger);
	if (legacy === 'corrupt') {
		const exists = await readCacheFile(input.workspaceLedger).catch(
			() => '',
		);
		return exists === undefined ? 'none' : 'unreadable';
	}
	if (legacy.reservations.length === 0 && legacy.history.length === 0) {
		await rm(input.workspaceLedger, { force: true }).catch(() => undefined);
		return 'none';
	}
	const now = (input.now ?? Date.now)();
	try {
		await mkdir(dirname(input.machineLedger), { recursive: true });
		const adopted = await withFileMutex(input.machineLedger, async () => {
			const machine = await readLedger(input.machineLedger);
			if (machine === 'corrupt') return false;
			const held = new Set(
				machine.reservations.map((each) => each.invocationId),
			);
			const spent = new Set(
				machine.history.map((each) => each.invocationId),
			);
			await writeLedger(
				input.machineLedger,
				[
					...machine.reservations,
					...legacy.reservations.filter(
						(each) =>
							Date.parse(each.expiresAt) > now &&
							!held.has(each.invocationId),
					),
				],
				[
					...machine.history,
					...legacy.history.filter(
						(each) => !spent.has(each.invocationId),
					),
				],
				machine.blockedUntil,
			);
			return true;
		});
		if (!adopted) return 'unreadable';
		await rm(input.workspaceLedger, { force: true });
		await mkdir(dirname(input.journal), { recursive: true });
		await appendFile(
			input.journal,
			`${JSON.stringify({
				event: 'quota-ledger.adopted',
				from: input.workspaceLedger,
				to: input.machineLedger,
				reservations: legacy.reservations.length,
				history: legacy.history.length,
				at: new Date(now).toISOString(),
			})}\n`,
		);
		return 'adopted';
	} catch {
		return 'unreadable';
	}
};
