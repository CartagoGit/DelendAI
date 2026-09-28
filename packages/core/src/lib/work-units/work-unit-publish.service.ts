import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import {
	publicationRefFromWorkRef,
	publishWorkUnitExclusively,
} from './work-publish.service';
import {
	choosePublicationTarget,
	proposalStillInProgress,
} from './publication-target.service';
import { openPublicationPullRequest } from './publication-pull-request.service';
import { scalarArg } from './command-args.helper';

import {
	agentFor,
	forgeCli,
	readGit,
	integrationBase,
	integrationRemote,
	kindFor,
	kindInAgent,
	openWork,
	refused,
	unknownKind,
} from './work-unit-shared.service';
import { ambiguousUnit, existingWorkRef } from './work-unit-generation.service';

/**
 * Hand the work over: the publication ref carries it, and the work ref
 * stops existing. The two halves belong together — doing only the first
 * is what fills a namespace with `wip/` branches that look alive.
 */
export const published = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return refused(
			'Publishing needs the unit of work it is publishing.',
			'work publish --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>] [--remote=origin] [--keep-work-ref].',
		);
	}
	if (scalarArg(args, 'as') !== undefined) {
		return refused(
			'A publication is not named separately from the work it publishes.',
			'Drop `--as=`: the publication ref is derived from the work ref, so both carry the same name and the shape is stated once.',
		);
	}
	if (policy.branches.workRefTemplate.length === 0) {
		return refused(
			`The \`${policy.profile}\` profile has no work-ref model: it commits to \`${policy.branches.integration}\` directly.`,
			'There is nothing to publish from; this profile integrates without a work ref.',
		);
	}
	const badKind = unknownKind(args) ?? kindInAgent(agent);
	if (badKind !== undefined) return badKind;
	const ambiguous = ambiguousUnit(root, args, policy, agent, proposal, slice);
	if (ambiguous !== undefined) return ambiguous;
	const workRef = existingWorkRef(root, args, policy, agent, proposal, slice);
	if (publicationRefFromWorkRef(policy, workRef) === undefined) {
		return refused(
			`\`${workRef}\` is not under this policy's work-ref prefix \`${policy.branches.workRefPrefix}\`.`,
			'A publication keeps the name of the work it publishes; a ref outside the namespace has no name to keep.',
		);
	}
	// `--remote` is global: the parser hands it over as `globals.remote`.
	const remote = ctx.globals.remote ?? integrationRemote(root, policy);
	const base = integrationBase(root, policy);
	if (base === undefined) {
		return refused(
			`The integration branch \`${policy.branches.integration}\` resolves to no commit in this clone.`,
			'Fetch it (git fetch), or correct development.branches.integration.',
		);
	}
	// Whether this slice is published alone or joins its proposal's pull
	// request is the policy's decision (integration.publication).
	const target = choosePublicationTarget({
		root,
		policy,
		remote,
		agent,
		proposal,
		slice,
		generation: Number(scalarArg(args, 'generation') ?? '1'),
		topic: scalarArg(args, 'topic'),
		kind: kindFor(args, slice),
		base,
		workRef,
	});
	if ('refusal' in target) {
		return refused(
			target.refusal,
			'Publish from a work ref under the policy prefix.',
		);
	}
	// The branch of a proposal still in progress outlives this
	// publication: its next slices are committed on it.
	const inProgress = proposalStillInProgress(root, proposal, workRef);
	const keepWorkRef = args.includes('--keep-work-ref') || inProgress;
	const outcome = await publishWorkUnitExclusively({
		root,
		cwd: ctx.cwd,
		workRef,
		publicationRef: target.publicationRef,
		remote,
		keepWorkRef,
		...(inProgress && !args.includes('--keep-work-ref')
			? {
					keepWorkRefBecause: `${proposal} is still in progress, and its next slices are committed on this branch`,
				}
			: {}),
	});
	const publication = {
		unit: target.unit,
		reason: target.reason,
		ref: target.publicationRef,
		// A publication moves only by fast-forward; nothing is forced over
		// work already proposed. It moves on without this work when it
		// carries the proposal's earlier slices, or when the queue brought
		// an open pull request level with the integration branch.
		...(!outcome.published && (target.unit === 'proposal' || keepWorkRef)
			? {
					nextAction: `If ${remote}/${target.publicationRef.replace(/^refs\/heads\//u, '')} has commits this work lacks (the proposal's earlier slices, or the queue's refresh of its open pull request), merge it into this work, then publish again.`,
				}
			: {}),
	};
	// The publication becomes a pull request here, by the machine that
	// holds the forge credential (x00677): a publication nobody opened a
	// pull request for is work that never lands.
	const pullRequest =
		outcome.published &&
		outcome.tip !== null &&
		policy.integration.requiresPullRequest &&
		!args.includes('--no-pull-request')
			? openPublicationPullRequest({
					remote,
					base: policy.branches.integration,
					branch: target.publicationRef.replace(
						/^refs\/heads\//u,
						'',
					),
					tip: outcome.tip,
					integrationBase: base,
					fallbackTitle: `${kindFor(args, slice)} ${proposal}`,
					ports: {
						git: (gitArgs) => readGit(root, gitArgs),
						gh: (ghArgs) => forgeCli(root, ghArgs),
					},
				})
			: undefined;
	return {
		// Published but not cleaned up is not a success: the namespace is
		// left carrying a ref that looks like live work.
		code:
			outcome.published && (outcome.workRefRemoved || keepWorkRef)
				? EXIT_CODE.OK
				: EXIT_CODE.VALIDATION,
		data: {
			...outcome,
			publication,
			...(pullRequest === undefined ? {} : { pullRequest }),
		},
	};
};
