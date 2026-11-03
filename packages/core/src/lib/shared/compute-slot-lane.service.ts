/**
 * compute-slot-lane.service.ts — what the compute slot records about who
 * holds it and who waits as urgent.
 *
 * The slot is first come first served; the urgent lane is the one exception
 * (a repair of a red integration branch, or a stated reason). Each urgent
 * caller leaves a ticket in `<lock>.urgent/`; normal callers yield to every
 * live ticket, urgent ones to the tickets ahead of theirs. Every urgent turn
 * is also logged, with its reason, beside the lock.
 */
import { randomUUID } from 'node:crypto';
import {
	appendFile,
	mkdir,
	readdir,
	readFile,
	rm,
	writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import type { IUrgentTicket } from '../contracts/interfaces/compute-slot.interface';

export const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return (error as { code?: string }).code === 'EPERM';
	}
};

export const readSlotJson = async <V>(path: string): Promise<V | undefined> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as V;
	} catch {
		return undefined;
	}
};

export const pauseSlot = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

export const ownerFile = (lockPath: string): string => `${lockPath}.owner`;

interface ISlotOwner {
	readonly label?: string;
	readonly pid?: number;
	readonly urgent?: string;
}

export const slotHolderOf = async (lockPath: string): Promise<string> => {
	const owner = await readSlotJson<ISlotOwner>(ownerFile(lockPath));
	if (owner === undefined) return 'another run';
	return `${owner.label ?? 'another run'} (pid ${String(owner.pid)})${owner.urgent === undefined ? '' : ` [urgent: ${owner.urgent}]`}`;
};

/** Every urgent turn taken, one JSON line each: the owner's record of jumps. */
export const urgentLogPath = (lockPath: string): string =>
	`${lockPath}.urgent.log`;

const laneDir = (lockPath: string): string => `${lockPath}.urgent`;

/** Live urgent tickets in arrival order; those of dead processes are dropped. */
export const readLane = async (
	lockPath: string,
): Promise<readonly (IUrgentTicket & { readonly name: string })[]> => {
	const names = await readdir(laneDir(lockPath)).catch(() => []);
	const tickets: (IUrgentTicket & { readonly name: string })[] = [];
	for (const name of [...names].sort()) {
		const ticket = await readSlotJson<IUrgentTicket>(
			join(laneDir(lockPath), name),
		);
		if (ticket !== undefined && alive(ticket.pid)) {
			tickets.push({ ...ticket, name });
		} else {
			await rm(join(laneDir(lockPath), name), { force: true });
		}
	}
	return tickets;
};

/** Take a place in the urgent lane; the name orders the lane. */
export const joinUrgentLane = async (
	lockPath: string,
	label: string,
	reason: string,
): Promise<string> => {
	await mkdir(laneDir(lockPath), { recursive: true });
	const name = `${String(Date.now()).padStart(15, '0')}-${randomUUID()}`;
	const ticket: IUrgentTicket = {
		label,
		pid: process.pid,
		reason,
		at: new Date().toISOString(),
	};
	await writeFile(join(laneDir(lockPath), name), JSON.stringify(ticket));
	return name;
};

export const leaveUrgentLane = (
	lockPath: string,
	name: string,
): Promise<void> => rm(join(laneDir(lockPath), name), { force: true });

/** An urgent turn begins: the owner reads who jumped the queue and why. */
export const recordUrgentTurn = (
	lockPath: string,
	label: string,
	reason: string,
): Promise<void> =>
	appendFile(
		urgentLogPath(lockPath),
		`${JSON.stringify({ at: new Date().toISOString(), label, pid: process.pid, reason })}\n`,
	);

/** What `work status` shows: who holds the slot and who waits as urgent. */
export const readComputeSlotLane = async (
	lockPath: string,
): Promise<{
	readonly holder: string | undefined;
	readonly urgent: readonly IUrgentTicket[];
}> => ({
	holder:
		(await readSlotJson(ownerFile(lockPath))) === undefined
			? undefined
			: await slotHolderOf(lockPath),
	urgent: await readLane(lockPath),
});

export const laneNotice = (lane: readonly IUrgentTicket[]): string =>
	lane.length === 0
		? ''
		: ` Urgent lane (${String(lane.length)}, taken first): ${lane
				.map((ticket) => `"${ticket.label}" — ${ticket.reason}`)
				.join('; ')}.`;
