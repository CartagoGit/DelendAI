import { deletedDocuments } from './review-pack-deletions.service';
import {
	describeCarriedPacks,
	otherReviewPacks,
	packsCarried,
} from './review-pack-scope.service';
import { readSwarm } from './work-swarm.service';
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
import { landWorkUnit } from './work-unit-land.service';
import { scalarArg } from './command-args.helper';
import { readWorkspaceDocsDir } from './development-policy.service';
import {
	isReviewUnitBranch,
	outsideReviewScope,
} from '../development-policy/git-guard-review-scope';
import { endCarriedUnits } from './carried-units.service';

import {
	agentFor,
	forgeCli,
	readGit,
	integrationBase,
	integrationRemote,
	kindFor,
	kindInAgent,
	mainWorktreeOf,
	openWork,
	refused,
	unknownKind,
} from './work-unit-shared.service';
import { ambiguousUnit, existingWorkRef } from './work-unit-generation.service';

/** The generation a work ref names (`…-g<n>/…`), if it names one. */
const generationOfWorkRef = (ref: string): number | undefined => {
	const found = /-g(\d+)\//u.exec(ref)?.[1];
	return found === undefined ? undefined : Number(found);
};

/**
 * Hand the work over: the publication ref carries it — or, under a
 * profile that integrates by merge, the integration branch does — and
 * the work ref stops existing. The two halves belong together — doing only the first
 * is what fills a namespace with `wip/` branches that look alive.
 */
export const published = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { policy } = opened;
	// Publishing removes the unit's worktree, which is where this command
	// may be standing: everything asked of git and the forge is asked from
	// the repository's own checkout, which stays.
	const root = mainWorktreeOf(opened.root);
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
	// A review records verdicts. What it changes beyond the project's
	// documents is not a review's to publish, however it was committed.
	if (isReviewUnitBranch(policy, workRef.replace(/^refs\/heads\//u, ''))) {
		const outside = outsideReviewScope(
			(
				readGit(root, [
					'diff',
					'--name-only',
					'--no-renames',
					`${base}...${workRef}`,
				]) ?? ''
			)
				.split('\n')
				.filter((path) => path.length > 0),
			await readWorkspaceDocsDir(root),
		);
		if (outside.length > 0) {
			return refused(
				`\`${workRef}\` is a unit that records verdicts, and it changes ${outside.join(', ')}: verdicts do not change the product.`,
				'Take those changes out of the unit (revert the commits that made them). A change the product needs is a proposal of its own, implemented in an `implement` unit.',
			);
		}
		const deleted = deletedDocuments(
			(
				readGit(root, [
					'diff',
					'--name-status',
					'--no-renames',
					`${base}...${workRef}`,
				]) ?? ''
			)
				.split('\n')
				.filter((line) => line.length > 0),
			await readWorkspaceDocsDir(root),
		);
		if (deleted.length > 0) {
			return refused(
				`\`${workRef}\` is a unit that records verdicts, and it deletes ${deleted.join(', ')}: a review moves a document, it never removes one.`,
				`Restore them from the integration branch (\`git checkout ${policy.branches.integration} -- ${deleted.join(' ')}\`), commit, and publish again.`,
			);
		}
		const commitsOver = (tip: string): readonly string[] =>
			(
				readGit(root, ['rev-list', '--no-merges', `${base}..${tip}`]) ??
				''
			)
				.split('\n')
				.filter((commit) => commit.length > 0);
		const own = commitsOver(workRef);
		if (own.length === 0) {
			return refused(
				`\`${workRef}\` records no verdict of its own: it holds nothing over \`${policy.branches.integration}\` but merges.`,
				'There is nothing to publish. Record a verdict in this unit; a unit that will record none is removed with its worktree and its branch.',
			);
		}
		const swarm = readSwarm({ root, policy });
		const carried = packsCarried(
			own,
			otherReviewPacks([...swarm.units, ...swarm.published], agent).map(
				(pack) => ({ ref: pack.ref, commits: commitsOver(pack.tip) }),
			),
		);
		if (carried.length > 0) {
			return refused(
				`\`${workRef}\` carries another reviewer's pack: one verdict in two pull requests conflicts with itself when the first one lands.`,
				describeCarriedPacks(carried, policy.branches.integration),
			);
		}
	}
	// The branch of a proposal still in progress outlives this
	// publication: its next slices are committed on it.
	const inProgress = proposalStillInProgress(root, proposal, workRef);
	const keepWorkRef = args.includes('--keep-work-ref') || inProgress;
	const keepWorkRefBecause =
		inProgress && !args.includes('--keep-work-ref')
			? `${proposal} is still in progress, and its next slices are committed on this branch`
			: undefined;
	// A profile that integrates by merge has no pull request to publish
	// into: the unit lands here, certified by the local gate, or not at all.
	if (policy.integration.strategy === 'merge') {
		return landWorkUnit({
			root,
			cwd: ctx.cwd,
			policy,
			remote,
			workRef,
			keepWorkRef,
			keepWorkRefBecause,
		});
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
		// The generation of the ref being published, not the one the
		// arguments default to: a second unit of one agent was otherwise
		// published into the first unit's pull request.
		generation:
			generationOfWorkRef(workRef) ??
			Number(scalarArg(args, 'generation') ?? '1'),
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
	const outcome = await publishWorkUnitExclusively({
		root,
		cwd: ctx.cwd,
		workRef,
		publicationRef: target.publicationRef,
		remote,
		keepWorkRef,
		...(keepWorkRefBecause === undefined ? {} : { keepWorkRefBecause }),
	});
	// The other units of this agent and proposal it carried end with it.
	const carried =
		outcome.published && outcome.tip !== null
			? await endCarriedUnits({
					root,
					cwd: ctx.cwd,
					policy,
					workRef,
					tip: outcome.tip,
					remote,
				})
			: [];
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
	// Published but not cleaned up is not a success: the namespace is
	// left carrying a ref that looks like live work.
	const landed = outcome.published && (outcome.workRefRemoved || keepWorkRef);
	// A failure says so in words, first. The reason used to sit only in
	// the list of steps, and a caller reading the summary took an
	// unpublished unit for a published one.
	const failed = outcome.steps.find((step) => !step.ok);
	const failure = landed
		? undefined
		: [
				outcome.published
					? `${workRef} was published, but its work ref was not removed.`
					: `${workRef} was NOT published.`,
				...(failed === undefined
					? []
					: [`${failed.name}: ${failed.detail}`]),
				...('nextAction' in publication
					? [publication.nextAction]
					: []),
			].join('\n');
	return {
		code: landed ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		...(failure === undefined ? {} : { error: failure }),
		data: {
			...outcome,
			...(carried.length === 0 ? {} : { carried }),
			publication,
			...(pullRequest === undefined ? {} : { pullRequest }),
		},
	};
};
