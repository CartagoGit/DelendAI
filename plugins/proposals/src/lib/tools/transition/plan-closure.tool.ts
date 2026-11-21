import { relative } from 'node:path';
import { toolError } from '@delendai/core/public';
import { SafeWorkspaceReader } from '@delendai/core/runtime';
import type { ILocatedProposal } from '../../proposals/locate';
import { isPlanProposal } from '../../proposals/proposal-type-detector';
import { openPlansContaining } from '../../swarm/plan-audits.service';
import { runPlanClosureGuard } from '../../swarm/plan-closure-guard';
import type { IProposalTransitionArgs } from '../../contracts/proposal-transition-input.contract';
import type { IProposalTransitionToolOptions } from '../../contracts/interfaces/proposal-transition-tool.interface';

// ---------------------------------------------------------------------------
// Step 4 — q00001 closure guard (only fires for `type: plan` → done).
// ---------------------------------------------------------------------------

export const maybeApplyPlanClosureGuard = async (
	args: IProposalTransitionArgs,
	found: ILocatedProposal,
	options: IProposalTransitionToolOptions,
): Promise<ReturnType<typeof toolError> | null> => {
	if (args.to !== 'done') return null;
	if (options.indexPathAbs === undefined) return null;

	// `locateProposal` returns a partial record when only the index
	// matched (no re-read of the file). The plan-closure guard needs
	// the full markdown, so we re-read it here. Cheap and keeps the
	// locate helper single-responsibility.
	const raw = (
		await new SafeWorkspaceReader(options.proposalsDirAbs).readText(
			relative(options.proposalsDirAbs, found.absPath),
		)
	).content;
	if (!isPlanProposal(raw)) {
		// An audit a plan settles closes with that plan (f00764); only the
		// plan's own closure carries it to done.
		if (args.skipDfaForPlanClosure === true || !/^a\d{5}$/u.test(args.id))
			return null;
		const plans = await openPlansContaining({
			auditId: args.id,
			proposalsDirAbs: options.proposalsDirAbs,
		});
		return plans.length === 0
			? null
			: toolError(
					`audit ${args.id} is settled by plan ${plans.join(', ')}; it closes when the plan does`,
					`Settle its findings in the plan's ledger and close the plan with proposals_close_plan; the audit moves to done with it.`,
				);
	}

	const guard = await runPlanClosureGuard({
		planId: args.id,
		planAbsPath: found.absPath,
		proposalsDirAbs: options.proposalsDirAbs,
		indexPathAbs: options.indexPathAbs,
	});
	if (guard.closable) return null;
	return toolError(
		`plan ${args.id} is not closable: ${guard.blockerCount} blocker(s)`,
		`Resolve the blockers first, then call proposal_transition again.\n${guard.blockerLines.join('\n')}\n\nTip: use proposals_close_plan for a friendlier wrapper that runs this same guard.`,
	);
};
