/**
 * compute-slot.service.ts — the one machine-wide slot for heavy compute.
 *
 * A machine has one set of cores however many agents work on it. Proofs,
 * typechecks and test runs that start together each spawn their own
 * workers: the load climbs, timing-sensitive specs fail, a proof takes an
 * hour. Whoever starts heavy compute takes this slot first and waits its
 * turn, saying who holds it; the slot is released when the work ends, and
 * a holder that dies without releasing it is reclaimed by the file mutex
 * (its process id is probed, so no timeout has to elapse).
 *
 * ONE MECHANISM: `tools/scripts/lib/with-compute-lock.script.ts` (every
 * `bun run test|typecheck|lint`) and the unit proof both come through
 * here. The slot is re-entrant across processes: while it is held, the
 * environment names it, so the commands a proof runs (which are wrapped by
 * the same script) run inside the turn instead of waiting for themselves.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	COMPUTE_SLOT_ENV,
	LANE_YIELD_MS,
} from '../contracts/constants/compute-slot.constant';
import type { IComputeSlotRequest } from '../contracts/interfaces/compute-slot.interface';
import {
	alive,
	joinUrgentLane,
	urgentTicketName,
	leaveUrgentLane,
	ownerFile,
	pauseSlot,
	readSlotJson,
	readLane,
	recordUrgentTurn,
} from './compute-slot-lane.service';
import { runGitCommand } from './git-command.helper';
import { createWaitNotice } from './compute-slot-wait-notice.service';
import { withFileMutex } from './with-file-mutex';

/** A proof can outlast several peers' proofs: wait long before giving up. */
const WAIT_BUDGET_MS = 4 * 60 * 60 * 1000;

/**
 * A holder silent this long is judged by its process: dead is reclaimed,
 * alive keeps the slot however long a blocked event loop stays silent.
 */
const STALE_MS = 30 * 1000;

/** The wait notice appears only when the slot is not free at once. */
const WAIT_NOTICE_MS = 1_000;

/** Where the slot lives: in the git directory every worktree shares. */
export const computeSlotPath = (cwd: string): string | undefined => {
	const gitDir = runGitCommand(cwd, [
		'rev-parse',
		'--path-format=absolute',
		'--git-common-dir',
	]);
	return gitDir.ok && gitDir.out.length > 0
		? join(gitDir.out, 'delendai', 'heavy-compute.lock')
		: undefined;
};

const heldBy = (lockPath: string, pid: number): string =>
	`${lockPath}@${String(pid)}`;

const heldByAncestor = (lockPath: string): boolean => {
	const held = process.env[COMPUTE_SLOT_ENV];
	const prefix = `${lockPath}@`;
	if (held === undefined || !held.startsWith(prefix)) return false;
	const pid = Number(held.slice(prefix.length));
	return Number.isInteger(pid) && pid !== process.pid;
};

const SUPERSEDED = Symbol('superseded');

/** How often a joiner looks for the owner's result. */
const JOIN_POLL_MS = 50;

interface ITurnClaim {
	readonly pid: number;
	readonly id: string;
}

type TurnResult =
	| { readonly value: unknown }
	| { readonly superseded: true }
	| { readonly error: string; readonly code?: string | undefined };

/**
 * One turn per unit and tip, across processes: the first caller of a tip
 * leaves a claim next to the slot lock; a later caller of that tip, in this
 * process or another, waits for the claimant's result file and returns it.
 * A newer tip of the unit supersedes an older one that has not started: the
 * older one gives its turn up and returns the newer tip's answer.
 */
/** The newest tip each unit asked for in this process; one entry per unit. */
const localCurrent = new Map<string, string>();

/** Where the turns of one unit (its worktree, or a bare tip) are kept. */
const unitTurnDirectory = (lockPath: string, unit: string): string =>
	`${lockPath}.units/${createHash('sha1').update(unit).digest('hex').slice(0, 16)}`;

const CLAIM_SUFFIX = '.claim';

/**
 * Whether a live process claims a turn of `unit`: a proof of it waits for
 * the slot, or holds it. The claim is written before the wait begins and
 * removed when the result is, so it spans the whole proof.
 */
export const unitTurnInFlight = async (
	lockPath: string,
	unit: string,
): Promise<boolean> => {
	const dir = unitTurnDirectory(lockPath, unit);
	const names = await readdir(dir).catch(() => [] as string[]);
	for (const name of names) {
		if (!name.endsWith(CLAIM_SUFFIX)) continue;
		const claim = await readSlotJson<ITurnClaim>(join(dir, name));
		if (claim !== undefined && alive(claim.pid)) return true;
	}
	return false;
};

const withUnitTurn = async <T>(
	request: IComputeSlotRequest<T>,
	unit: string,
	tip: string,
): Promise<T> => {
	const dir = unitTurnDirectory(request.lockPath, unit);
	// On record at once in this process, so a newer tip is known before any
	// older tip can take the slot; the file tells other processes.
	localCurrent.set(dir, tip);
	await mkdir(dir, { recursive: true });
	const currentPath = join(dir, 'current');
	const claimPath = (name: string): string =>
		join(dir, `${name}${CLAIM_SUFFIX}`);
	const donePath = (name: string): string => join(dir, `${name}.done`);
	const resultPath = (name: string, id: string): string =>
		join(dir, `${name}.${id}.result`);
	await writeFile(currentPath, tip);
	const currentTip = async (): Promise<string> =>
		localCurrent.get(dir) ??
		(await readFile(currentPath, 'utf8').catch(() => tip));

	const follow = async (
		name: string,
		claim: ITurnClaim,
	): Promise<{ readonly result?: TurnResult }> => {
		for (;;) {
			const result = await readSlotJson<TurnResult>(
				resultPath(name, claim.id),
			);
			if (result !== undefined) return { result };
			const now = await readSlotJson<ITurnClaim>(claimPath(name));
			if (now?.id !== claim.id || !alive(claim.pid)) return {};
			await pauseSlot(JOIN_POLL_MS);
		}
	};
	const settle = (result: TurnResult): T => {
		if ('error' in result) {
			throw Object.assign(new Error(result.error), {
				code: result.code,
			});
		}
		return (result as { value: T }).value;
	};

	const joinOnly = async (name: string): Promise<T | typeof SUPERSEDED> => {
		let claim: ITurnClaim | undefined;
		// A newer turn of this process is on record before it has written
		// its claim: wait for the claim instead of proving the old tip.
		for (;;) {
			claim =
				(await readSlotJson<ITurnClaim>(claimPath(name))) ??
				(await readSlotJson<ITurnClaim>(donePath(name)));
			if (claim !== undefined || localCurrent.get(dir) !== name) break;
			await pauseSlot(JOIN_POLL_MS);
		}
		if (claim === undefined) return SUPERSEDED;
		const { result } = await follow(name, claim);
		if (result === undefined) return SUPERSEDED;
		if ('superseded' in result) {
			const newer = await currentTip();
			return newer === name ? SUPERSEDED : joinOnly(newer);
		}
		return settle(result);
	};

	for (;;) {
		const claim = await readSlotJson<ITurnClaim>(claimPath(tip));
		if (claim !== undefined && alive(claim.pid)) {
			const { result } = await follow(tip, claim);
			if (result === undefined) continue;
			if ('superseded' in result) {
				const newer = await currentTip();
				const joined =
					newer === tip ? SUPERSEDED : await joinOnly(newer);
				if (joined !== SUPERSEDED) return joined;
				// The newer turn vanished: prove this tip after all.
				await writeFile(currentPath, tip);
				await pauseSlot(JOIN_POLL_MS);
				continue;
			}
			return settle(result);
		}
		const mine: ITurnClaim = { pid: process.pid, id: randomUUID() };
		if (claim !== undefined) await rm(claimPath(tip), { force: true });
		try {
			await writeFile(claimPath(tip), JSON.stringify(mine), {
				flag: 'wx',
			});
		} catch {
			continue;
		}
		let result: TurnResult;
		try {
			const value = await withComputeSlotTurn<T | typeof SUPERSEDED>(
				request,
				async () =>
					(await currentTip()) === tip ? request.run() : SUPERSEDED,
			);
			result = value === SUPERSEDED ? { superseded: true } : { value };
		} catch (error) {
			result = {
				error: error instanceof Error ? error.message : String(error),
				code: (error as { code?: string }).code,
			};
		}
		await writeFile(resultPath(tip, mine.id), JSON.stringify(result));
		await writeFile(donePath(tip), JSON.stringify(mine));
		await rm(claimPath(tip), { force: true });
		if ('superseded' in result) {
			const newer = await currentTip();
			const joined = newer === tip ? SUPERSEDED : await joinOnly(newer);
			if (joined !== SUPERSEDED) return joined;
			await writeFile(currentPath, tip);
			await pauseSlot(JOIN_POLL_MS);
			continue;
		}
		return settle(result);
	}
};

export const withComputeSlot = <T>(
	request: IComputeSlotRequest<T>,
): Promise<T> =>
	request.unit !== undefined && request.tip !== undefined
		? withUnitTurn(request, request.unit, request.tip)
		: withComputeSlotTurn(request, request.run);

const YIELD = Symbol('yield');

/** The normal turns this process has asked for, per slot, in call order. */
const processQueue = new Map<string, Promise<void>>();

const withComputeSlotTurn = async <T>(
	request: IComputeSlotRequest<T>,
	body: () => Promise<T> | T,
): Promise<T> => {
	const { lockPath, label, urgent } = request;
	// The place in the urgent lane is fixed by call order, before any wait.
	const ticketName = urgent === undefined ? undefined : urgentTicketName();
	// Held by an ancestor process (a proof running this very command): the
	// turn is already ours. Held by THIS process means another caller here.
	if (heldByAncestor(lockPath)) {
		return body();
	}
	const notify =
		request.notify ?? ((message: string) => console.error(message));
	// Normal callers in this process reach the slot in the order they asked:
	// the file mutex alone lets a later caller overtake an earlier one while
	// both are still preparing to contend for it. Urgent callers keep their
	// own lane and never wait behind the queue.
	const before =
		urgent === undefined
			? (processQueue.get(lockPath) ?? Promise.resolve())
			: Promise.resolve();
	let leave: () => void = () => undefined;
	const mine = new Promise<void>((resolve) => {
		leave = resolve;
	});
	const tail = before.then(() => mine);
	if (urgent === undefined) processQueue.set(lockPath, tail);
	const clearQueue = (): void => {
		leave();
		if (processQueue.get(lockPath) === tail) processQueue.delete(lockPath);
	};
	await mkdir(dirname(lockPath), { recursive: true }).catch(
		(error: unknown) => {
			clearQueue();
			throw error;
		},
	);
	// An urgent caller joins the lane before it waits: normal callers yield
	// to every live ticket, urgent ones to the tickets ahead of theirs.
	if (ticketName !== undefined && urgent !== undefined) {
		await joinUrgentLane(lockPath, ticketName, label, urgent);
	}
	const mustYield = async (): Promise<boolean> => {
		const lane = await readLane(lockPath);
		return ticketName === undefined
			? lane.length > 0
			: lane.some((ticket) => ticket.name < (ticketName as string));
	};
	const notice = createWaitNotice({
		lockPath,
		label,
		urgent,
		notify,
		delayMs: request.waitNoticeMs ?? WAIT_NOTICE_MS,
	});
	try {
		await before;
		for (;;) {
			const outcome = await withFileMutex(
				lockPath,
				async () => {
					if (await mustYield()) return YIELD;
					if (notice.end())
						notify(`[compute-slot] "${label}" got its turn.`);
					await writeFile(
						ownerFile(lockPath),
						JSON.stringify({
							label,
							pid: process.pid,
							...(urgent === undefined ? {} : { urgent }),
						}),
					);
					if (urgent !== undefined) {
						await recordUrgentTurn(lockPath, label, urgent);
					}
					process.env[COMPUTE_SLOT_ENV] = heldBy(
						lockPath,
						process.pid,
					);
					try {
						return await body();
					} finally {
						delete process.env[COMPUTE_SLOT_ENV];
						await rm(ownerFile(lockPath), { force: true });
					}
				},
				{
					timeoutMs: request.timeoutMs ?? WAIT_BUDGET_MS,
					staleMs: request.staleMs ?? STALE_MS,
					onContention: 'fail',
				},
			);
			if (outcome !== YIELD) return outcome;
			await pauseSlot(LANE_YIELD_MS);
		}
	} finally {
		clearQueue();
		notice.end();
		if (ticketName !== undefined) {
			await leaveUrgentLane(lockPath, ticketName);
		}
	}
};
