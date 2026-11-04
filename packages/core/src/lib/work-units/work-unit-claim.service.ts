import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import {
	applyWorkClaim,
	claimableWorkRefs,
	planWorkClaim,
} from './work-claim.service';
import { scalarArg } from './command-args.helper';
import { carryUnitRecords, handedOver } from './unit-adoption.service';
import { workRefOfPublication } from './orphaned-work.service';
import { gitCommonDirOf } from './unit-lease.service';
import { updateUnitLease } from './unit-lease.store';
import type { IWorkClaim } from '../contracts/interfaces/work-claim.interface';
import { releaseClaimedSlices } from './slice-reservation.service';

import {
	agentFor,
	identityRemedy,
	readGit,
	openWork,
	refused,
} from './work-unit-shared.service';

/**
 * Take over a unit of work somebody else started, by renaming its ref.
 *
 * A work ref is named after who owns it, so a ref one agent abandoned
 * and another is finishing is a ref that lies — and every question the
 * naming scheme exists to answer gets the wrong answer. Renaming is
 * mechanical, so the machine does it; a rule that depends on an LLM
 * remembering is a rule this project keeps finding broken.
 */
export const claimed = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const agent = agentFor(args, opened.root, opened.policy.identity);
	// Without a name nothing can be claimed, and the listing would read as
	// "nothing here belongs to anybody else".
	if (agent.length === 0) {
		return refused(
			'no agent identity: a claimed unit is renamed after its claimant, and there is no name to give it.',
			`Pass --agent=<your model id>, or set DELENDAI_AGENT_ID.${identityRemedy(opened.policy)}`,
		);
	}
	const ref = scalarArg(args, 'ref');
	const candidates = claimableWorkRefs({
		root: opened.root,
		agent,
		policy: opened.policy,
	});
	if (ref === undefined) {
		// No ref named: say what there is to take, and take nothing.
		const lines =
			candidates.length === 0
				? ['no unit of work here belongs to anybody else']
				: [
						`${String(candidates.length)} unit(s) of work held by somebody else:`,
						...candidates.map(
							(candidate) =>
								`  ${candidate.from}\n    → ${candidate.to}  (held by ${candidate.heldBy})`,
						),
						'',
						'Take one with: delendai work claim --ref=<ref>',
					];
		process.stdout.write(`${lines.join('\n')}\n`);
		return {
			code: EXIT_CODE.OK,
			data: { claimable: candidates },
			suppressDefaultPrint: true,
		};
	}
	const sha = readGit(opened.root, ['rev-parse', ref]);
	if (sha === undefined || sha.length === 0) {
		return refused(
			`${ref} does not resolve to a commit in this clone.`,
			'Fetch it first, or name a ref that exists here.',
		);
	}
	// A publication whose unit ended (its author finished) has no work ref
	// to rename: the claimant gets a work ref at its tip, and the
	// publication stays where it is.
	const fromPublication = workRefOfPublication(opened.policy, ref);
	if (
		fromPublication !== undefined &&
		readGit(opened.root, [
			'rev-parse',
			'-q',
			'--verify',
			`refs/heads/${fromPublication}`,
		]) === undefined
	) {
		return adoptPublication(
			opened.root,
			fromPublication,
			sha,
			agent,
			opened.policy,
		);
	}
	const planned = planWorkClaim({
		ref,
		sha,
		agent,
		policy: opened.policy,
	});
	if (!('to' in planned)) {
		return refused(
			planned.reason,
			'`delendai work claim` with no --ref lists what is takeable.',
		);
	}
	const result = applyWorkClaim(opened.root, planned);
	if (!('to' in result)) {
		return refused(
			result.reason,
			'Nothing was lost: the work is still reachable under at least one of the two names.',
		);
	}
	// The lease and the forge's copy of the old name go with the unit.
	const carried = await carryUnitRecords({
		cwd: opened.root,
		policy: opened.policy,
		from: result.from,
		to: result.to,
		owner: result.claimedBy,
	});
	// A reservation names the unit by its old name: left, it kept the
	// slice the previous agent's, and the claimant was refused its own unit.
	const released = releaseClaimedSlices(
		opened.root,
		opened.policy,
		result.from,
	);
	process.stdout.write(
		`${[
			`claimed  ${result.from}`,
			`      →  ${result.to}`,
			`         ${result.sha} — the same commit, a different name`,
			`         was ${result.heldBy}, now ${result.claimedBy}, generation ${String(result.generation)}`,
		].join('\n')}\n`,
	);
	return {
		code: EXIT_CODE.OK,
		data: { ...result, ...carried, releasedReservations: released },
		suppressDefaultPrint: true,
	};
};

/**
 * Take over a publication whose unit is gone: a new work ref, named after
 * the claimant, at the publication's tip, and a lease that says whose it
 * was. Nothing is moved or deleted, so nothing can be lost.
 */
const adoptPublication = async (
	root: string,
	workRef: string,
	sha: string,
	agent: string,
	policy: Parameters<typeof planWorkClaim>[0]['policy'],
): Promise<IWorkUnitResult> => {
	const planned = planWorkClaim({ ref: workRef, sha, agent, policy });
	if (!('to' in planned)) {
		return refused(
			planned.reason,
			'`delendai work claim` with no --ref lists what is takeable.',
		);
	}
	if (
		readGit(root, ['update-ref', `refs/heads/${planned.to}`, sha, '']) ===
		undefined
	) {
		return refused(
			`could not create ${planned.to}: another unit may hold that name.`,
			'Nothing was changed: the publication is where it was.',
		);
	}
	const common = gitCommonDirOf(root);
	const now = Math.floor(Date.now() / 1000);
	if (common !== undefined) {
		await updateUnitLease(common, planned.to, () =>
			handedOver(
				{
					ref: workRef,
					owner: { agent: planned.heldBy, session: null },
					worktree: null,
					entrySha: sha,
					enteredAt: now,
					heartbeatAt: now,
				},
				planned.to,
				agent,
				now,
			),
		);
	}
	const claim: IWorkClaim = planned;
	process.stdout.write(
		`${[
			`adopted  ${workRef} (its unit had ended; the publication is kept)`,
			`      →  ${claim.to}`,
			`         was ${claim.heldBy}, now ${claim.claimedBy}, generation ${String(claim.generation)}`,
		].join('\n')}\n`,
	);
	return {
		code: EXIT_CODE.OK,
		data: { ...claim, adoptedPublication: true },
		suppressDefaultPrint: true,
	};
};
