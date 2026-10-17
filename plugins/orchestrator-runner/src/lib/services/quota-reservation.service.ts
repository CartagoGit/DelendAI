/**
 * quota-reservation.service.ts — no two invocations spend the same room.
 *
 * Checking a pool and then spending from it is a race: two workers that
 * each read one request left would both go. A reservation is taken under
 * the cross-process file mutex the rest of delendai coordinates with, so
 * the check and the hold are one step for every process on the machine.
 * It is idempotent by invocation id (a retry holds nothing twice), expires
 * on its own (a crashed holder frees its room after the TTL), and is
 * released when the invocation ends.
 *
 * What it will not do is guess. A pool with no observation, an
 * observation older than the freshness bound, a window with no limit or
 * no usage, or a ledger it cannot read, refuses: `unknown` is never
 * `unlimited`. Every window of a pool is its own limit, checked on its
 * own, and pools of different units are never added together.
 */
import { quarantineCorruptFile } from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import type { IProviderAccount } from '@delendai/core/contracts';

import type {
	IQuotaGroupObservation,
	IQuotaReservation,
	IQuotaHold,
	IQuotaReservationOutcome,
} from '../contracts/interfaces/quota-reservation.interface';
import { readQuotaSnapshot } from '../quota/read-quota';
import { readCacheFile } from './read-cache-file.helper';

const LEDGER_SCHEMA = 'delendai/orchestrator-runner/quota-reservations/1';

type Ledger = { readonly reservations: readonly IQuotaReservation[] };

const readLedger = async (path: string): Promise<Ledger | 'corrupt'> => {
	let raw: string | undefined;
	try {
		raw = await readCacheFile(path);
	} catch {
		return 'corrupt';
	}
	if (raw === undefined) return { reservations: [] };
	try {
		const parsed = JSON.parse(raw) as {
			schema?: unknown;
			reservations?: unknown;
		};
		if (
			parsed.schema !== LEDGER_SCHEMA ||
			!Array.isArray(parsed.reservations)
		)
			return 'corrupt';
		return { reservations: parsed.reservations as IQuotaReservation[] };
	} catch {
		return 'corrupt';
	}
};

const writeLedger = (
	path: string,
	reservations: readonly IQuotaReservation[],
) =>
	writeFileAtomic(
		path,
		`${JSON.stringify({ schema: LEDGER_SCHEMA, reservations }, null, '\t')}\n`,
	);

/** Why `group` has no room for one more invocation, or nothing when it has. */
const shortOf = (
	group: string,
	observation: IQuotaGroupObservation | undefined,
	held: number,
	now: number,
	freshForMs: number,
): string | undefined => {
	if (observation === undefined)
		return `quota group "${group}" has never been observed`;
	const observedAt = Date.parse(observation.observedAt);
	if (!Number.isFinite(observedAt) || now - observedAt > freshForMs)
		return `quota group "${group}" was last observed at ${observation.observedAt}, too long ago to trust`;
	if (observation.windows.length === 0)
		return `quota group "${group}" reports no window`;
	for (const window of observation.windows) {
		if (window.limit === null || window.used === null)
			return `the ${window.window} window of quota group "${group}" is unknown`;
		const left = window.limit - window.used;
		const needed = window.unit === 'requests' ? held + 1 : 1;
		if (window.unit === 'requests' ? left < needed : left <= 0)
			return `the ${window.window} window of quota group "${group}" has no room (${String(left)} ${window.unit} left, ${String(held)} invocation(s) holding it)`;
	}
	return undefined;
};

export const reserveQuota = async (input: {
	readonly ledgerPath: string;
	readonly invocationId: string;
	readonly groups: readonly string[];
	readonly observationOf: (
		group: string,
	) => IQuotaGroupObservation | undefined;
	readonly ttlMs: number;
	readonly freshForMs: number;
	readonly now?: () => number;
}): Promise<IQuotaReservationOutcome> => {
	const now = (input.now ?? Date.now)();
	return withFileMutex(input.ledgerPath, async () => {
		const ledger = await readLedger(input.ledgerPath);
		if (ledger === 'corrupt') {
			await quarantineCorruptFile(input.ledgerPath).catch(
				() => undefined,
			);
			return {
				kind: 'refused',
				reason: 'the quota reservation ledger could not be read, so what is already held is unknown; it was set aside',
			};
		}
		const live = ledger.reservations.filter(
			(reservation) => Date.parse(reservation.expiresAt) > now,
		);
		if (
			live.some(
				(reservation) =>
					reservation.invocationId === input.invocationId,
			)
		)
			return { kind: 'reserved' };
		for (const group of input.groups) {
			const held = live.filter((reservation) =>
				reservation.groups.includes(group),
			).length;
			const reason = shortOf(
				group,
				input.observationOf(group),
				held,
				now,
				input.freshForMs,
			);
			if (reason !== undefined) return { kind: 'refused', reason };
		}
		await writeLedger(input.ledgerPath, [
			...live,
			{
				invocationId: input.invocationId,
				groups: [...input.groups],
				expiresAt: new Date(now + input.ttlMs).toISOString(),
			},
		]);
		return { kind: 'reserved' };
	});
};

export const releaseQuota = async (
	ledgerPath: string,
	invocationId: string,
): Promise<void> =>
	withFileMutex(ledgerPath, async () => {
		const ledger = await readLedger(ledgerPath);
		if (ledger === 'corrupt') return;
		await writeLedger(
			ledgerPath,
			ledger.reservations.filter(
				(reservation) => reservation.invocationId !== invocationId,
			),
		);
	});

/**
 * The hold the invocation manager takes before a hop on an account: the
 * pools that account declares, as the quota snapshot last observed them.
 * An account that declares no pool cannot be bounded, so it is refused.
 */
export const quotaHoldFor = (input: {
	readonly accounts: readonly IProviderAccount[];
	readonly ledgerPath: string;
	readonly quotasPath: string;
	readonly ttlMs: number;
	readonly freshForMs: number;
}): IQuotaHold => {
	const accounts = new Map(
		input.accounts.map((account) => [account.accountId, account]),
	);
	return async (_providerId, accountId, invocationId) => {
		if (accountId === undefined) return undefined;
		const account = accounts.get(accountId);
		if (account === undefined)
			return {
				kind: 'refused',
				reason: `account "${accountId}" is not in the account registry`,
			};
		if (account.quotaGroups.length === 0)
			return {
				kind: 'refused',
				reason: `account "${accountId}" declares no quota group, so what it may spend cannot be bounded`,
			};
		const snapshot = await readQuotaSnapshot(input.quotasPath);
		const outcome = await reserveQuota({
			ledgerPath: input.ledgerPath,
			invocationId,
			groups: account.quotaGroups,
			observationOf: (group) => snapshot.groups[group],
			ttlMs: input.ttlMs,
			freshForMs: input.freshForMs,
		});
		return outcome.kind === 'refused'
			? outcome
			: {
					kind: 'reserved',
					release: () => releaseQuota(input.ledgerPath, invocationId),
				};
	};
};
