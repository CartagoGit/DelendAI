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

import type {
	IAccountBudget,
	IProviderAccount,
} from '@delendai/core/contracts';

import type {
	IQuotaGroupObservation,
	IQuotaReservation,
	IQuotaHold,
	IQuotaReservationOutcome,
	IQuotaGroupRemaining,
} from '../contracts/interfaces/quota-reservation.interface';
import { readQuotaSnapshot } from '../quota/read-quota';
import { groupWindowsOf, recordGroupObservation } from '../quota';
import type { QuotaSink } from '../subprocess/api';
import { readCacheFile } from './read-cache-file.helper';
import { QUOTA_WINDOW_MS } from '../contracts/constants/quota-window.constant';

const LEDGER_SCHEMA = 'delendai/orchestrator-runner/quota-reservations/1';

/** A hop that was reserved, kept to count what a declared budget has spent. */
interface ISpentReservation {
	readonly invocationId: string;
	readonly groups: readonly string[];
	readonly at: string;
}

type Ledger = {
	readonly reservations: readonly IQuotaReservation[];
	/** Additive: a ledger written before budgets reads as none spent. */
	readonly history: readonly ISpentReservation[];
};

const WINDOW_MS: Readonly<Record<IAccountBudget['window'], number>> =
	QUOTA_WINDOW_MS;

const readLedger = async (path: string): Promise<Ledger | 'corrupt'> => {
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
		return {
			reservations: parsed.reservations as IQuotaReservation[],
			history: Array.isArray(parsed.history)
				? (parsed.history as ISpentReservation[])
				: [],
		};
	} catch {
		return 'corrupt';
	}
};

const writeLedger = (
	path: string,
	reservations: readonly IQuotaReservation[],
	history: readonly ISpentReservation[],
) =>
	writeFileAtomic(
		path,
		`${JSON.stringify({ schema: LEDGER_SCHEMA, reservations, history }, null, '\t')}\n`,
	);

/**
 * A group's windows as the reservation judges them: what was observed, if
 * fresh, and a window per declared budget, counted from the hops already
 * spent (live ones are counted as held). A stale observation is dropped
 * when a budget stands in: kept, it refused every hop after a 429 for good,
 * since no hop could run to observe the group again.
 */
const judgedObservation = (input: {
	readonly observed: IQuotaGroupObservation | undefined;
	readonly budgets: readonly IAccountBudget[];
	readonly group: string;
	readonly spent: readonly ISpentReservation[];
	readonly now: number;
	readonly freshForMs: number;
}): IQuotaGroupObservation | undefined => {
	if (input.budgets.length === 0) return input.observed;
	const observedAt = Date.parse(input.observed?.observedAt ?? '');
	const fresh =
		input.observed !== undefined &&
		Number.isFinite(observedAt) &&
		input.now - observedAt <= input.freshForMs
			? input.observed
			: undefined;
	return {
		observedAt: fresh?.observedAt ?? new Date(input.now).toISOString(),
		windows: [
			...(fresh?.windows ?? []),
			...input.budgets.map((budget) => ({
				window: budget.window,
				unit: 'requests' as const,
				limit: budget.requests,
				used: input.spent.filter(
					(entry) =>
						entry.groups.includes(input.group) &&
						input.now - Date.parse(entry.at) <=
							WINDOW_MS[budget.window],
				).length,
				resetAt: null,
			})),
		],
	};
};

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
	/** What the account may spend where the vendor does not say. */
	readonly budgets?: readonly IAccountBudget[];
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
			return { kind: 'reserved', remaining: [] };
		const liveIds = new Set(
			live.map((reservation) => reservation.invocationId),
		);
		// Spent and not still held: a live hop is counted once, as held.
		const spent = ledger.history.filter(
			(entry) => !liveIds.has(entry.invocationId),
		);
		const remaining: IQuotaGroupRemaining[] = [];
		for (const group of input.groups) {
			const held = live.filter((reservation) =>
				reservation.groups.includes(group),
			).length;
			const observed = input.observationOf(group);
			const judged = judgedObservation({
				observed,
				budgets: input.budgets ?? [],
				group,
				spent,
				now,
				freshForMs: input.freshForMs,
			});
			const reason = shortOf(group, judged, held, now, input.freshForMs);
			if (reason !== undefined) return { kind: 'refused', reason };
			remaining.push({
				group,
				windows: (judged?.windows ?? []).map((window, index) => ({
					window: window.window,
					unit: window.unit,
					left: (window.limit ?? 0) - (window.used ?? 0) - held,
					source:
						index <
						(judged?.windows.length ?? 0) -
							(input.budgets?.length ?? 0)
							? 'observed'
							: 'budget',
				})),
			});
		}
		const longest = Math.max(...Object.values(WINDOW_MS));
		await writeLedger(
			input.ledgerPath,
			[
				...live,
				{
					invocationId: input.invocationId,
					groups: [...input.groups],
					expiresAt: new Date(now + input.ttlMs).toISOString(),
				},
			],
			[
				...ledger.history.filter(
					(entry) => now - Date.parse(entry.at) <= longest,
				),
				{
					invocationId: input.invocationId,
					groups: [...input.groups],
					at: new Date(now).toISOString(),
				},
			],
		);
		return { kind: 'reserved', remaining };
	});
};

/**
 * How many live reservations hold each quota group now; `undefined` when
 * the ledger cannot be read, so a reader never shows "nothing held" for
 * what it does not know.
 */
export const heldByGroup = async (
	ledgerPath: string,
	now: number = Date.now(),
): Promise<ReadonlyMap<string, number> | undefined> => {
	const ledger = await readLedger(ledgerPath);
	if (ledger === 'corrupt') return undefined;
	const held = new Map<string, number>();
	for (const reservation of ledger.reservations) {
		if (Date.parse(reservation.expiresAt) <= now) continue;
		for (const group of reservation.groups)
			held.set(group, (held.get(group) ?? 0) + 1);
	}
	return held;
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
			ledger.history,
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
			budgets: account.budgets ?? [],
		});
		return outcome.kind === 'refused'
			? outcome
			: {
					kind: 'reserved',
					remaining: outcome.remaining,
					release: () => releaseQuota(input.ledgerPath, invocationId),
				};
	};
};

/**
 * Where a provider's quota samples go: the groups of the account it runs
 * on. A provider on no account, or on one without groups, records nothing.
 * Never throws into the hop: a sample that cannot be written is lost, and
 * the next hop is judged on what was.
 */
export const quotaSinkFor = (input: {
	readonly providers: readonly {
		readonly id: string;
		readonly accountId?: string | undefined;
	}[];
	readonly accounts: readonly IProviderAccount[];
	readonly quotasPath: string;
}): QuotaSink => {
	const groupsOf = new Map(
		input.providers.flatMap((provider) => {
			const account = input.accounts.find(
				(each) => each.accountId === provider.accountId,
			);
			return account === undefined
				? []
				: [[provider.id, account.quotaGroups] as const];
		}),
	);
	return (sample) => {
		const groups = groupsOf.get(sample.providerId) ?? [];
		void recordGroupObservation(
			input.quotasPath,
			groups,
			groupWindowsOf(sample),
		).catch(() => undefined);
	};
};
