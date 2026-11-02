/**
 * maintenance-lease.service.ts — one server process maintains a workspace.
 *
 * On 2026-10-17 four host servers served this workspace, and each ran
 * the same background maintenance on its own clock (publishing work
 * checkouts, bringing the checkout forward, refreshing candidates), from
 * processes that did not all run the same code. Whatever changes refs or
 * the forge in the background runs in the process holding this lease;
 * every other server serves its session and says who maintains.
 *
 * The holder is named by machine, process and a nonce drawn at boot,
 * never by agent: two sessions of one model are two holders, and a pid
 * the system reused is not the holder that died.
 *
 * WHY a hard link to take it and a rename to renew: linking a fully
 * written file into place is an atomic create-or-fail, so of two servers
 * taking a free lease one learns it lost from the syscall, and no reader
 * ever sees half a record (which it would take for a broken lease and
 * steal). A lease is removed only while it is still the record judged
 * stale (see `removeIfStill`), so a contender never deletes the lease
 * another has just taken. Within a process, calls are serial.
 */
import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname } from 'node:path';

import {
	MAINTENANCE_LEASE_HEARTBEAT_MS,
	MAINTENANCE_LEASE_TTL_MS,
} from '../contracts/constants/maintenance-lease.constant';
import type {
	IHostMaintenance,
	IMaintenanceGate,
	IMaintenanceLease,
	IMaintenanceLeaseOptions,
	IMaintenanceLeaseRecord,
	IMaintenanceStanding,
} from '../contracts/interfaces/maintenance-lease.interface';

const processIsAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM: it exists, it just is not ours to signal.
		return (error as { readonly code?: string }).code === 'EPERM';
	}
};

/**
 * Remove the lease at `path` only while it holds `judged`: moved aside in
 * one rename, compared, and put back when another process replaced it in
 * between. Whether the judged record is gone.
 */
export const removeIfStill = async (
	path: string,
	judged: string,
	scratch: string,
): Promise<boolean> => {
	const aside = `${scratch}.stale`;
	try {
		await rename(path, aside);
	} catch {
		// Already gone: nothing of anybody's was removed.
		return true;
	}
	const moved = await readFile(aside, 'utf8').catch(() => undefined);
	if (moved === judged) {
		await rm(aside, { force: true });
		return true;
	}
	// Somebody renewed or took it since: theirs goes back, if the place is
	// still free.
	await link(aside, path).catch(() => undefined);
	await rm(aside, { force: true });
	return false;
};

const readRecord = async (
	path: string,
): Promise<IMaintenanceLeaseRecord | undefined> => {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
		if (typeof parsed !== 'object' || parsed === null) return undefined;
		const record: Partial<IMaintenanceLeaseRecord> = parsed;
		return typeof record.holder === 'string' &&
			typeof record.machineId === 'string' &&
			typeof record.pid === 'number' &&
			typeof record.renewedAt === 'number'
			? {
					holder: record.holder,
					machineId: record.machineId,
					pid: record.pid,
					renewedAt: record.renewedAt,
				}
			: undefined;
	} catch {
		return undefined;
	}
};

export const createMaintenanceLease = (
	options: IMaintenanceLeaseOptions,
): IMaintenanceLease => {
	const now = options.now ?? Date.now;
	const ttl = options.ttlMs ?? MAINTENANCE_LEASE_TTL_MS;
	const isAlive = options.isAlive ?? processIsAlive;
	const pid = options.pid ?? process.pid;
	const self = `${options.machineId}#${String(pid)}#${options.nonce ?? randomUUID().slice(0, 8)}`;
	const record = (): string =>
		JSON.stringify({
			holder: self,
			machineId: options.machineId,
			pid,
			renewedAt: now(),
		} satisfies IMaintenanceLeaseRecord);
	const live = (held: IMaintenanceLeaseRecord): boolean =>
		now() - held.renewedAt <= ttl &&
		!(held.machineId === options.machineId && !isAlive(held.pid));
	const scratch = `${options.path}.${self.replace(/[^\w.-]/gu, '_')}`;
	const take = async (): Promise<boolean> => {
		try {
			await mkdir(dirname(options.path), { recursive: true });
			await writeFile(scratch, record(), 'utf8');
			await link(scratch, options.path);
			return true;
		} catch {
			return false;
		} finally {
			await rm(scratch, { force: true });
		}
	};
	let queue: Promise<unknown> = Promise.resolve();
	const serial = <T>(step: () => Promise<T>): Promise<T> => {
		const next = queue.then(step, step);
		queue = next.catch(() => undefined);
		return next;
	};
	return {
		self,
		hold: () =>
			serial(async () => {
				const held = await readRecord(options.path);
				if (held?.holder === self) {
					await writeFile(scratch, record(), 'utf8');
					await rename(scratch, options.path);
					return true;
				}
				if (held !== undefined && live(held)) return false;
				// Free: the atomic create decides. Removing first let a
				// contender delete the lease another had just created, and
				// both took it.
				const judged = await readFile(options.path, 'utf8').catch(
					() => undefined,
				);
				if (judged === undefined) return take();
				// Unreadable, or left by a holder that stopped beating: it
				// goes only while it is still the record judged here.
				if (!(await removeIfStill(options.path, judged, scratch))) {
					return false;
				}
				return take();
			}),
		release: () =>
			serial(async () => {
				if ((await readRecord(options.path))?.holder === self) {
					await rm(options.path, { force: true });
				}
			}),
		holder: async () => {
			const held = await readRecord(options.path);
			return held !== undefined && live(held) ? held : undefined;
		},
	};
};

/**
 * The one gate a server process puts in front of its ref-changing
 * background work: older code than its checkout gives the lease up (a
 * current server takes over), and a server that does not hold the lease
 * leaves the work to the one that does. The holder beats on its own
 * clock, so a lease lasts as long as its process, not as long as its
 * slowest maintenance step.
 */
export const createMaintenanceGate = (input: {
	readonly lease: IMaintenanceLease;
	readonly behind?: (() => Promise<string | undefined>) | undefined;
	readonly heartbeatMs?: number | undefined;
	/** Told each time the standing changes: the line a log keeps. */
	readonly report?: ((line: string) => void) | undefined;
}): IMaintenanceGate => {
	const { lease } = input;
	let said: string | undefined;
	const tell = (reason: string | undefined): string | undefined => {
		const line =
			reason ?? `This server (${lease.self}) maintains this workspace.`;
		if (line !== said) {
			said = line;
			input.report?.(line);
		}
		return reason;
	};
	const decide = async (): Promise<
		{ readonly reason: string; readonly maintainer?: string } | undefined
	> => {
		const behind = await input.behind?.();
		if (behind !== undefined) {
			await lease.release();
			return {
				reason: `${behind} It maintains nothing (no work ref pushed, withdrawn or reaped, no checkout moved) until it restarts.`,
			};
		}
		if (await lease.hold()) return undefined;
		const holder = (await lease.holder())?.holder;
		return {
			reason: `Server ${holder ?? 'another process'} maintains this workspace; this one (${lease.self}) serves its session only.`,
			...(holder === undefined ? {} : { maintainer: holder }),
		};
	};
	const beat = setInterval(() => {
		void decide()
			.then((decided) => tell(decided?.reason))
			.catch(() => undefined);
	}, input.heartbeatMs ?? MAINTENANCE_LEASE_HEARTBEAT_MS);
	beat.unref?.();
	return {
		standDown: async () => tell((await decide())?.reason),
		stop: async () => {
			clearInterval(beat);
			await lease.release();
		},
	};
};

/**
 * Who maintains the workspace, read without taking or renewing anything:
 * `status` asks from any process, a one-off command included, and must
 * not make that process the maintainer.
 */
export const observeMaintenance = async (
	lease: IMaintenanceLease,
	behind?: (() => Promise<string | undefined>) | undefined,
): Promise<IMaintenanceStanding> => {
	const holder = (await lease.holder())?.holder;
	const stale = await behind?.();
	if (stale !== undefined) {
		return {
			maintains: false,
			reason: `${stale} It maintains nothing until it restarts.`,
			...(holder === undefined ? {} : { maintainer: holder }),
		};
	}
	return holder === lease.self
		? { maintains: true, maintainer: holder }
		: {
				maintains: false,
				...(holder === undefined
					? { reason: 'No server holds the maintenance lease yet.' }
					: {
							maintainer: holder,
							reason: `Server ${holder} maintains this workspace; this one serves its session only.`,
						}),
			};
};

/** A server's maintenance, from its lease file and its runtime watch. */
export const createHostMaintenance = (input: {
	readonly path: string;
	readonly behind?: (() => Promise<string | undefined>) | undefined;
	readonly report?: ((line: string) => void) | undefined;
}): IHostMaintenance => {
	const lease = createMaintenanceLease({
		path: input.path,
		machineId: hostname(),
	});
	let made: IMaintenanceGate | undefined;
	return {
		gate: () => {
			made ??= createMaintenanceGate({
				lease,
				behind: input.behind,
				report: input.report,
			});
			return made;
		},
		observe: () => observeMaintenance(lease, input.behind),
		stop: async () => {
			await made?.stop();
		},
	};
};
