import { describeLoop, workRefLoopsAt } from './work-ref-moves.service';
import { unitsOutsideTheirSlice } from './outside-slice.service';
import { unverifiedAgents } from './unverified-agents.service';
import { seenModels } from '../work-identity/model-identity.helper';
import { readWorkspaceDocsDir } from './development-policy.service';
import {
	anchorFromPolicy,
	anchorRefusal,
	observeAnchor,
} from '../wip-engine/index';
import { policyOriginNote } from '../development-policy/served-work-model';
import { checkedOutBranch } from '../development-policy/project-branches';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { describeRoster, rosterOf } from './swarm-roster.service';
import {
	listStrandedEdits,
	resumeStrandedEdits,
} from './stranded-edits.service';
import { describeSwarm, readSwarm } from './work-swarm.service';
import { reportedOrphans } from './orphaned-work.service';
import {
	describeOrphan,
	describePublicationStanding,
	publicationStandings,
	readOrphans,
} from './publication-standings.service';
import {
	countStandings,
	readUnitStandings,
	summarizeStandings,
} from './unit-standings.service';
import { divergedReviewPacks } from './diverged-review-pack.service';
import { waitingOnAuthor } from './publication-dispositions.service';
import { reportDirtyPaths } from './work-dirty-paths.service';
import { renderInvariantReport } from './workflow-invariants.service';
import { runWorkflowDoctor } from './workflow-doctor.service';

import {
	gitVerbatim,
	integrationBase,
	openWork,
	readGit,
	refused,
	undurableAdvice,
	workspaceOf,
} from './work-unit-shared.service';
import { computeSlotPath } from '../shared/compute-slot.service';
import { readComputeSlotLane } from '../shared/compute-slot-lane.service';
import { namespacedRef } from './namespaced-ref.helper';

/** How many units whose publication moved ahead `work status` names. */
/** How many retired refs status names. */
const RETIRED_LINES = 3;

const MAX_AHEAD_LINES = 3;

/** Every branch tip, local or on origin, by its plain name (x01032). */
const branchTips = (root: string): ReadonlyMap<string, string> => {
	const tips = new Map<string, string>();
	const listed = readGit(root, [
		'for-each-ref',
		'--format=%(refname) %(objectname)',
		'refs/remotes/origin/',
		'refs/heads/',
	]);
	for (const line of (listed ?? '').split('\n')) {
		const [ref, sha] = line.split(' ');
		if (ref === undefined || sha === undefined) continue;
		tips.set(ref.replace(/^refs\/(?:heads|remotes\/origin)\//u, ''), sha);
	}
	return tips;
};

const anchoredLine = (payload: {
	readonly anchorRequired: boolean;
	readonly anchored: boolean;
	readonly anchorRefusal: string | null;
}): string => {
	if (!payload.anchorRequired) {
		return 'not required (this profile does not anchor the checkout)';
	}
	return payload.anchored ? 'yes' : `NO — ${payload.anchorRefusal ?? ''}`;
};

/** Says so when the project wrote no model and delendai adopted one. */
const adoptedNote = (policy: IResolvedDevelopmentPolicy): string => {
	const note = policyOriginNote(policy);
	return note === undefined ? '' : ` (${note})`;
};

export const statusOf = async (
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	const branch = checkedOutBranch(root);
	const swarm = readSwarm({ root, policy });
	const paths = reportDirtyPaths({
		git: (args) => gitVerbatim(root, args),
		refs: swarm.units,
	});
	const base = integrationBase(root, policy);
	const standings = await readUnitStandings({ root, policy });
	const { orphans, presence } = await readOrphans({
		root,
		policy,
		published: swarm.published,
		standings,
	});
	const slotPath = computeSlotPath(root);
	const slot =
		slotPath === undefined
			? undefined
			: await readComputeSlotLane(slotPath);
	const payload = {
		computeSlot: {
			holder: slot?.holder ?? null,
			urgent: slot?.urgent ?? [],
		},
		profile: policy.profile,
		policySource: policy.source,
		adoptionWrittenTo: policy.adoption?.writtenTo ?? null,
		integration: policy.branches.integration,
		branch: branch ?? null,
		pinnedCheckout: policy.workspace.pinnedCheckout,
		agentWorktrees: policy.workspace.agentWorktrees,
		anchorRequired: policy.workspace.anchoredToIntegrationBranch,
		anchored:
			policy.workspace.anchoredToIntegrationBranch &&
			anchor === undefined,
		anchorRefusal: anchor ?? null,
		workRefTemplate: policy.branches.workRefTemplate,
		base: base ?? null,
		dirty: paths.dirty,
		undurable: paths.undurable,
		units: countStandings(standings),
		// Names at work that nothing confirms are a model's.
		unverifiedAgents: unverifiedAgents({
			agents: [...swarm.units, ...swarm.published].map(
				(unit) => unit.agent,
			),
			seen: seenModels(),
			roster: policy.coordination.roster ?? [],
			namespacePrefix: policy.branches.namespacePrefix,
		}),
		// Implement units that changed files their slice does not name.
		outsideSlice: unitsOutsideTheirSlice({
			root,
			docsDir: await readWorkspaceDocsDir(root),
			policy,
			units: swarm.units,
		}),
		unitsNextAction: summarizeStandings(standings).nextAction,
		waitingOnAuthor: await waitingOnAuthor(root),
		orphans,
		reportedOrphans: await reportedOrphans(root),
		publications: publicationStandings({
			published: swarm.published,
			presence,
			tipAt: (sha) => {
				const at = Number(
					readGit(root, ['log', '-1', '--format=%ct', sha]),
				);
				return Number.isFinite(at) && at > 0 ? at : undefined;
			},
			now: Math.floor(Date.now() / 1000),
		}),
		refLoops: await workRefLoopsAt(root),
		// Edits an agent left in the shared checkout, kept at a start.
		stranded: listStrandedEdits({ root, policy }).map((kept) => ({
			...kept,
			resume: resumeStrandedEdits(kept.ref),
		})),
		// Delivered and retired work stays reachable by name: the latest.
		retired: (
			readGit(root, [
				'for-each-ref',
				'--sort=-committerdate',
				`--count=${String(RETIRED_LINES)}`,
				'--format=%(refname)',
				`${namespacedRef(policy.branches.namespacePrefix, 'retired')}/`,
			]) ?? ''
		)
			.split('\n')
			.filter((ref) => ref.length > 0),
		divergedPacks: divergedReviewPacks({
			refs: branchTips(root),
			isAncestor: (sha, of) =>
				readGit(root, ['merge-base', '--is-ancestor', sha, of]) !==
				undefined,
		}).slice(0, MAX_AHEAD_LINES),
		publicationsAhead: standings
			.filter((unit) => unit.publicationAhead)
			.map((unit) => ({
				ref: unit.ref,
				publication: unit.publicationRef,
			})),
	};
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: payload };
	}
	process.stdout.write(
		`${[
			`profile          ${payload.profile}${adoptedNote(policy)}`,
			`integration      ${payload.integration}`,
			`checkout on      ${payload.branch ?? '(detached)'}`,
			`anchored         ${anchoredLine(payload)}`,
			`work ref shape   ${payload.workRefTemplate.length > 0 ? payload.workRefTemplate : '(none: this profile commits directly)'}`,
			`dirty paths      ${String(payload.dirty.length)}`,
			`undurable        ${String(payload.undurable.length)}`,
			`${summarizeStandings(standings).line.replace('units:', 'units           ')}`,
			...(payload.unitsNextAction === null
				? []
				: [`                 next: ${payload.unitsNextAction}`]),
			...payload.publicationsAhead
				.slice(0, MAX_AHEAD_LINES)
				.map(
					(unit) =>
						`publication ahead  ${unit.ref}: its publication moved on (the queue refreshed it); merge \`${unit.publication ?? 'the publication ref'}\` into the unit before republishing`,
				),
			...payload.divergedPacks.map(
				(pack) =>
					`pack diverged   ${pack.pack} holds commits its wip ${pack.wip} lacks: from that wip run \`${pack.merge}\` before publishing`,
			),
			...(payload.computeSlot.holder === null &&
			payload.computeSlot.urgent.length === 0
				? []
				: [
						`compute slot     ${payload.computeSlot.holder ?? 'free'}${payload.computeSlot.urgent.length === 0 ? '' : `; urgent lane: ${payload.computeSlot.urgent.map((ticket) => `"${ticket.label}" — ${ticket.reason}`).join('; ')}`}`,
					]),
			...payload.stranded.map(
				(kept) =>
					`stranded         ${kept.ref} (for ${kept.agent}): ${kept.resume}`,
			),
			...payload.retired.map(
				(ref) =>
					`kept             ${ref} (its work ref is gone; the tip is here)`,
			),
			...payload.refLoops.map(
				(loop) => `ref loop         ${describeLoop(loop)}`,
			),
			...payload.waitingOnAuthor.map(
				(entry) =>
					`waits on author #${String(entry.number)} ${entry.headRef}: ${entry.why}`,
			),
			...payload.orphans.map(describeOrphan),
			...payload.reportedOrphans.map(
				(entry) =>
					`orphan stuck     ${entry.headRef}: brought forward ${String(entry.attempts)} time(s) and still red; the hydrator stopped (its tip is kept). Adopt it: \`delendai work claim --ref=${entry.headRef}\``,
			),
			...payload.publications.map(describePublicationStanding),
			...undurableAdvice(payload.undurable),
		].join('\n')}\n`,
	);
	return { code: EXIT_CODE.OK, data: payload, suppressDefaultPrint: true };
};

/**
 * What everyone else is doing, before the first edit.
 *
 * A claim is consulted when a write is attempted, which is after the
 * work exists; this answers the question that avoids the collision
 * instead of detecting it.
 */
export const swarm = async (
	ctx: IWorkUnitContext,
	args: readonly string[] = [],
): Promise<IWorkUnitResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const view = readSwarm({ root: opened.root, policy: opened.policy });
	const standings = await readUnitStandings({
		root: opened.root,
		policy: opened.policy,
	});
	const agents = rosterOf(view, standings);
	const { orphans } = await readOrphans({
		root: opened.root,
		policy: opened.policy,
		published: view.published,
		standings,
	});
	const ended = new Set(
		standings
			.filter(
				(entry) =>
					entry.standing === 'delivered' ||
					entry.standing === 'abandoned',
			)
			.map((entry) => entry.ref),
	);
	const data = { ...view, agents, orphans };
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data };
	}
	const lines = [
		...describeSwarm(view, { ended, all: args.includes('--all') }),
		...describeRoster(agents),
		...orphans.map(describeOrphan),
	];
	process.stdout.write(`${lines.join('\n')}\n`);
	return { code: EXIT_CODE.OK, data, suppressDefaultPrint: true };
};

/**
 * Ask whether the work-ref model is actually holding.
 *
 * Read-only by construction: a checker that also repairs cannot be run
 * to find out whether repair was needed.
 */
export const doctored = async (
	args: readonly string[],
	ctx: IWorkUnitContext,
): Promise<IWorkUnitResult> => {
	const report = await runWorkflowDoctor({
		from: workspaceOf(ctx),
		...(args.includes('--forge') ? { scopes: ['forge' as const] } : {}),
	});
	if (report === undefined) {
		return refused(
			`${workspaceOf(ctx)} is not inside a git working tree.`,
			'Run this from the repository, or pass --workspace=<path>.',
		);
	}
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return {
			code: report.broken === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
			data: report,
		};
	}
	process.stdout.write(`${renderInvariantReport(report)}\n`);
	return {
		code: report.broken === 0 ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: report,
		suppressDefaultPrint: true,
	};
};
