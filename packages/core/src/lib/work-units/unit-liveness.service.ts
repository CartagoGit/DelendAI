/**
 * unit-liveness.service.ts — the one answer to "is anybody on this unit
 * right now".
 *
 * WHY one judgement: the doctor, the reaper, the end of finished units,
 * orphan detection and the queue each read life their own way, and none
 * read it right before acting. A unit whose heartbeat was one minute old
 * lost its worktree while its proof ran. Life is any of:
 *
 * - its lease beat inside the lease window, with no quota exhaustion said
 *   since (the owner's own word that its session is gone);
 * - a live process carries the owner's session in its environment;
 * - a live process claims a proof turn of the unit (waiting for the
 *   compute slot, or holding it);
 * - a live process works inside its worktree.
 *
 * Processes are read from `/proc` where the system has one; elsewhere the
 * lease and the proof claim still speak, and nothing is guessed.
 */
import { readdir, readFile, readlink, realpath } from 'node:fs/promises';
import { join, sep } from 'node:path';

import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	computeSlotPath,
	unitTurnInFlight,
} from '../shared/compute-slot.service';
import type {
	IMachineLife,
	IUnitLease,
	IUnitLife,
	IUnitLifeEvidence,
	IUnitLifeSign,
} from './unit-lease.interface';
import { UNIT_SESSION_VARIABLE as SESSION_VARIABLE } from '../contracts/constants/agent-environment.constant';
import { gitCommonDirOf } from './unit-lease.service';
import { readUnitLease } from './unit-lease.store';
import { leaseWindowSeconds } from './unit-verdict.service';

const PROC = '/proc';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const SIGN_WORDS: Readonly<Record<IUnitLifeSign, string>> = {
	heartbeat: 'its lease beat inside the window',
	'owner-session': "its owner's session is running",
	proof: 'a proof of it is in flight',
	process: 'a process works inside its worktree',
};

/** The live processes of the machine, read once per pass. */
export const readMachineLife = async (): Promise<IMachineLife> => {
	const entries = await readdir(PROC).catch(() => [] as string[]);
	const cwds: string[] = [];
	const sessions = new Set<string>();
	const self = String(process.pid);
	await Promise.all(
		entries
			.filter((name) => /^\d+$/u.test(name) && name !== self)
			.map(async (pid) => {
				const cwd = await readlink(join(PROC, pid, 'cwd')).catch(
					() => undefined,
				);
				if (cwd !== undefined) cwds.push(cwd);
				const environ = await readFile(
					join(PROC, pid, 'environ'),
					'utf8',
				).catch(() => '');
				for (const pair of environ.split('\0')) {
					if (pair.startsWith(`${SESSION_VARIABLE}=`)) {
						const session = pair.slice(SESSION_VARIABLE.length + 1);
						if (session.length > 0) sessions.add(session);
					}
				}
			}),
	);
	return { cwds, sessions };
};

const inside = (cwd: string, dir: string): boolean =>
	cwd === dir || cwd.startsWith(dir.endsWith(sep) ? dir : `${dir}${sep}`);

const freshBeat = (
	lease: IUnitLease | undefined,
	now: number,
	windowSeconds: number,
): boolean => {
	if (lease === undefined) return false;
	const quota = lease.outOfQuotaAt;
	if (quota !== undefined && quota >= lease.heartbeatAt) return false;
	return Math.max(0, now - lease.heartbeatAt) <= windowSeconds;
};

/** The verdict, from evidence already read. Pure. */
export const judgeUnitLife = (evidence: IUnitLifeEvidence): IUnitLife => {
	const session = evidence.lease?.owner.session ?? null;
	const signs: IUnitLifeSign[] = [];
	if (freshBeat(evidence.lease, evidence.now, evidence.windowSeconds))
		signs.push('heartbeat');
	if (session !== null && evidence.machine.sessions.has(session))
		signs.push('owner-session');
	if (evidence.proving) signs.push('proof');
	if (
		evidence.worktrees.some((dir) =>
			evidence.machine.cwds.some((cwd) => inside(cwd, dir)),
		)
	)
		signs.push('process');
	return {
		alive: signs.length > 0,
		signs,
		why:
			signs.length === 0
				? 'no heartbeat inside the window, no running session, proof or process'
				: `alive: ${signs.map((sign) => SIGN_WORDS[sign]).join(', ')}`,
	};
};

/** Every spelling of the unit's worktree that a process or a proof uses. */
const worktreePaths = async (
	paths: readonly (string | null | undefined)[],
): Promise<readonly string[]> => {
	const known = new Set<string>();
	for (const path of paths) {
		if (path === null || path === undefined || path.length === 0) continue;
		known.add(path);
		const real = await realpath(path).catch(() => undefined);
		if (real !== undefined) known.add(real);
	}
	return [...known];
};

/**
 * A reader that judges any number of units of `root` against one reading
 * of the machine, taken the first time a unit needs it.
 */
export const unitLifeReader = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly now?: number | undefined;
	/** How the machine's processes are read; the real scan unless a spec gives its own. */
	readonly readMachine?: (() => Promise<IMachineLife>) | undefined;
}): ((unit: {
	readonly ref: string;
	readonly lease?: IUnitLease | undefined;
	readonly worktree?: string | null | undefined;
}) => Promise<IUnitLife>) => {
	const common = gitCommonDirOf(input.root);
	const slot = computeSlotPath(input.root);
	const windowSeconds = leaseWindowSeconds(
		input.policy.coordination.leaseTtlMinutes,
	);
	let machine: Promise<IMachineLife> | undefined;
	return async (unit) => {
		const lease =
			unit.lease ??
			(common === undefined
				? undefined
				: await readUnitLease(common, unit.ref));
		const worktrees = await worktreePaths([lease?.worktree, unit.worktree]);
		let proving = false;
		if (slot !== undefined) {
			for (const key of worktrees) {
				if (await unitTurnInFlight(slot, key)) {
					proving = true;
					break;
				}
			}
		}
		machine ??= (input.readMachine ?? readMachineLife)();
		return judgeUnitLife({
			lease,
			worktrees,
			proving,
			machine: await machine,
			now: input.now ?? nowSeconds(),
			windowSeconds,
		});
	};
};

/**
 * The unit's life read afresh: the check made immediately before each
 * step that removes something of it.
 */
export const unitLifeNow = (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly ref: string;
	readonly worktree?: string | null | undefined;
	readonly now?: number | undefined;
	readonly readMachine?: (() => Promise<IMachineLife>) | undefined;
}): Promise<IUnitLife> =>
	unitLifeReader(input)({
		ref: input.ref.replace(/^refs\/heads\//u, ''),
		worktree: input.worktree,
	});

/** The refs among `refs` whose unit is alive, judged against one reading. */
export const liveUnitRefs = async (input: {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly refs: Iterable<string>;
	readonly now?: number | undefined;
	readonly readMachine?: (() => Promise<IMachineLife>) | undefined;
}): Promise<ReadonlySet<string>> => {
	const lifeOf = unitLifeReader(input);
	const live = new Set<string>();
	for (const ref of input.refs) {
		if ((await lifeOf({ ref })).alive) live.add(ref);
	}
	return live;
};
