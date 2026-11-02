/**
 * unit-lease.service.ts — who owns a unit, and keeping that fresh.
 *
 * The owner is the agent named by the ref and the HOST SESSION that
 * entered it (`work enter` stamps one on the worktree). The process that
 * runs `delendai work …` lives for a few hundred milliseconds, so a pid
 * would make every unit look abandoned the moment its command returned.
 */
import { shortName } from '../development-policy/git-guard-namespaces';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import { readUnitLease, updateUnitLease } from './unit-lease.store';
import type {
	IRecordUnitEntry,
	ITouchUnit,
	IUnitLease,
} from './unit-lease.interface';
import { readGit } from './work-unit-shared.service';
import { worktreeAgent, worktreeSession } from './worktree-agent.service';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const shortRef = (ref: string): string => ref.replace(/^refs\/heads\//u, '');

/** The git directory every worktree of `cwd`'s clone shares. */
export const gitCommonDirOf = (cwd: string): string | undefined =>
	readGit(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);

/**
 * Record a unit's owner when it is entered. Entering a unit that already
 * has a lease keeps its original `enteredAt` and entry commit, and takes
 * the entering session as owner: it passed the session check to get here.
 */
export const recordUnitEntered = async (
	entry: IRecordUnitEntry,
): Promise<IUnitLease | undefined> => {
	const common = gitCommonDirOf(entry.cwd);
	if (common === undefined) return undefined;
	const now = entry.now ?? nowSeconds();
	const entrySha =
		readGit(entry.cwd, ['rev-parse', '-q', '--verify', entry.ref]) ?? null;
	return updateUnitLease(common, shortRef(entry.ref), (current) => ({
		ref: shortRef(entry.ref),
		owner: entry.owner,
		worktree: entry.worktree,
		clientCwd: entry.clientCwd ?? current?.clientCwd ?? null,
		serverRoot: entry.serverRoot ?? current?.serverRoot ?? null,
		entrySha: current?.entrySha ?? entrySha,
		enteredAt: current?.enteredAt ?? now,
		heartbeatAt: now,
	}));
};

/**
 * Show life on a unit. A session that is not the unit's owner does not
 * refresh it: an orchestrator reading a subagent's unit must not keep an
 * abandoned one looking alive. A unit with no lease yet (entered before
 * leases existed) is claimed by whoever works in it.
 */
export const touchUnit = async (
	touch: ITouchUnit,
): Promise<IUnitLease | undefined> => {
	const common = gitCommonDirOf(touch.cwd);
	if (common === undefined) return undefined;
	const now = touch.now ?? nowSeconds();
	return updateUnitLease(common, shortRef(touch.ref), (current) => {
		if (current === undefined) {
			return {
				ref: shortRef(touch.ref),
				owner: touch.owner,
				worktree: touch.worktree ?? null,
				entrySha: null,
				enteredAt: now,
				heartbeatAt: now,
			};
		}
		const foreign =
			current.owner.session !== null &&
			touch.owner.session !== null &&
			current.owner.session !== touch.owner.session;
		return foreign ? undefined : { ...current, heartbeatAt: now };
	});
};

/**
 * Show life on the unit whose worktree `cwd` is. Silent when `cwd` is the
 * shared checkout, a worktree delendai did not make, or not on a work ref:
 * those own no unit.
 */
export const touchUnitOfCheckout = async (
	cwd: string,
	policy: Pick<IResolvedDevelopmentPolicy, 'branches'>,
	now?: number,
): Promise<IUnitLease | undefined> => {
	const prefix = shortName(policy.branches.workRefPrefix);
	if (prefix.length === 0) return undefined;
	const head = readGit(cwd, ['symbolic-ref', '--quiet', 'HEAD']);
	if (head === undefined) return undefined;
	const ref = shortRef(head);
	if (!ref.startsWith(prefix)) return undefined;
	const top = readGit(cwd, ['rev-parse', '--show-toplevel']);
	if (top === undefined) return undefined;
	const agent = worktreeAgent(top);
	if (agent === undefined) return undefined;
	return touchUnit({
		cwd,
		ref,
		owner: { agent, session: worktreeSession(top) ?? null },
		worktree: top,
		now,
	});
};

export const readLeaseOf = async (
	cwd: string,
	ref: string,
): Promise<IUnitLease | undefined> => {
	const common = gitCommonDirOf(cwd);
	return common === undefined ? undefined : readUnitLease(common, ref);
};
