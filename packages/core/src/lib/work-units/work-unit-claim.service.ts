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
import { carryUnitRecords } from './unit-adoption.service';

import {
	agentFor,
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
	const agent = agentFor(args);
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
	});
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
		data: { ...result, ...carried },
		suppressDefaultPrint: true,
	};
};
