/**
 * `delendai work` — persist work to its own ref WITHOUT moving the
 * checkout, from anywhere.
 *
 * WHY this command exists: the policy every agent is told to obey ("the
 * shared checkout stays on the integration branch; your work lives in
 * your own ref") had exactly one implementation, behind the proposals
 * pipeline's MCP tools. From a console, from a host that does not load
 * those tools, or whenever that pipeline errors, an agent had no way to
 * obey it — so it fell back to `git switch -c`, and the graph filled with
 * work branches nobody asked for. A rule with no reachable
 * implementation is not a workflow; this is the missing implementation.
 *
 * WHY it refuses instead of moving anything: every operation runs through
 * the core WIP engine, which stages a temporary index and writes the ref
 * with `commit-tree`. `HEAD` never moves, `.git/index` is never touched,
 * and another agent's dirty files are neither captured nor a reason to
 * refuse — which is what lets twenty agents share one checkout.
 */
import { execFileSync } from 'node:child_process';

import {
	anchorFromPolicy,
	anchorRefusal,
	createWipEngine,
	resolveWorkAgentId,
	observeAnchor,
	checkedOutBranch,
	resolveWorkRef,
	sanitizeRefComponent,
	validateScopePaths,
} from '@delendai/core/public';
import type {
	IResolvedDevelopmentPolicy,
	IWipEngine,
} from '@delendai/core/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	ICliCommand,
	ICliCommandContext,
	ICliCommandResult,
} from '../contracts/interfaces/cli-command.interface';
import { readWorkspacePolicy } from '../lib/development-policy.service';
import {
	publicationRefFromWorkRef,
	publishWorkRef,
} from '../lib/work-publish.service';
import { readSwarm } from '../lib/work-swarm.service';
import {
	applyWorkClaim,
	claimableWorkRefs,
	planWorkClaim,
} from '../lib/work-claim.service';
import { renderInvariantReport } from '../lib/workflow-invariants.service';
import { runWorkflowDoctor } from '../lib/workflow-doctor.service';
import { scalarArg } from '../lib/helpers/cli-command.helper';

/** Read-only git, for the facts the engine does not already answer. */
const git = (cwd: string, args: readonly string[]): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

/**
 * `--workspace` is a GLOBAL flag, consumed by the parser before a command
 * sees its arguments; reading it from `args` silently resolved to the
 * process' own directory and created a worktree inside another worktree.
 */
/**
 * Who this invocation is working as. One resolver for the whole system
 * (x00560): an explicit `--agent`, then what the environment declares,
 * and never the machine — a ref named after a computer says who owns the
 * hardware, not who did the work.
 */
const agentFor = (args: readonly string[]): string => {
	const identity = resolveWorkAgentId({
		...(scalarArg(args, 'agent') === undefined
			? {}
			: { model: scalarArg(args, 'agent') }),
		environment: process.env.DELENDAI_AGENT_ID,
	});
	return identity.source === 'none' ? '' : identity.id;
};

const workspaceOf = (ctx: ICliCommandContext): string =>
	ctx.globals.workspace.length > 0 ? ctx.globals.workspace : ctx.cwd;

/**
 * The commit a checkpoint is based on: the integration branch as this
 * clone currently sees it, local first, then its remote-tracking copy.
 * Never `HEAD` — a checkpoint says "the integration branch, plus exactly
 * my paths", and `HEAD` may be anywhere.
 */
/**
 * The one remote this workspace integrates with, resolved the way the
 * reconciler resolves it (x00558 S3): what the integration branch
 * tracks, then `origin`, then the only remote there is. Hard-coding
 * `origin` here is how a project whose remote is `upstream` ended up
 * publishing to a repository it never fetched from.
 */
const integrationRemote = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): string => {
	const tracked = git(cwd, [
		'config',
		'--get',
		`branch.${policy.branches.integration}.remote`,
	]);
	if (tracked !== undefined && tracked.length > 0) return tracked;
	const remotes = (git(cwd, ['remote']) ?? '')
		.split('\n')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	if (remotes.includes('origin')) return 'origin';
	return remotes[0] ?? 'origin';
};

const integrationBase = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	const branch = policy.branches.integration;
	const remote = integrationRemote(cwd, policy);
	for (const candidate of [branch, `refs/remotes/${remote}/${branch}`]) {
		const sha = git(cwd, [
			'rev-parse',
			'-q',
			'--verify',
			`${candidate}^{commit}`,
		]);
		if (sha !== undefined && sha.length > 0) return sha;
	}
	return undefined;
};

/** Paths git reports as changed in the working tree, whoever changed them. */
const dirtyPaths = (cwd: string): readonly string[] => {
	const out = git(cwd, ['status', '--porcelain=v1', '-z']);
	if (out === undefined) return [];
	return out
		.split('\0')
		.filter((entry) => entry.length > 3)
		.map((entry) => entry.slice(3));
};

const refused = (reason: string, remedy: string): ICliCommandResult => ({
	code: EXIT_CODE.VALIDATION,
	error: `${reason}\n${remedy}`,
});

interface IWorkContext {
	readonly root: string;
	readonly policy: IResolvedDevelopmentPolicy;
	readonly engine: IWipEngine;
}

const openWork = async (
	ctx: ICliCommandContext,
): Promise<IWorkContext | ICliCommandResult> => {
	const root = workspaceOf(ctx);
	const policy = await readWorkspacePolicy(root);
	if (policy === undefined) {
		return refused(
			'This project declares no development policy.',
			'Add a `development` block to delendai.config.json; without one there is no work-ref model to follow.',
		);
	}
	const engine = await createWipEngine(root, anchorFromPolicy(policy));
	if (engine === undefined) {
		return refused(
			`${root} is not inside a git working tree.`,
			'Run this from the repository, or pass --workspace=<path>.',
		);
	}
	return { root, policy, engine };
};

const statusOf = async (
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	const branch = checkedOutBranch(root);
	const payload = {
		profile: policy.profile,
		integration: policy.branches.integration,
		branch: branch ?? null,
		pinnedCheckout: policy.workspace.pinnedCheckout,
		agentWorktrees: policy.workspace.agentWorktrees,
		anchored: anchor === undefined,
		anchorRefusal: anchor ?? null,
		workRefTemplate: policy.branches.workRefTemplate,
		base: integrationBase(root, policy) ?? null,
		dirty: dirtyPaths(root),
	};
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: payload };
	}
	process.stdout.write(
		`${[
			`profile          ${payload.profile}`,
			`integration      ${payload.integration}`,
			`checkout on      ${payload.branch ?? '(detached)'}`,
			`anchored         ${payload.anchored ? 'yes' : `NO — ${payload.anchorRefusal ?? ''}`}`,
			`work ref shape   ${payload.workRefTemplate.length > 0 ? payload.workRefTemplate : '(none: this profile commits directly)'}`,
			`dirty paths      ${String(payload.dirty.length)}`,
		].join('\n')}\n`,
	);
	return { code: EXIT_CODE.OK, data: payload, suppressDefaultPrint: true };
};

/**
 * The ref this identity works in. Kept in one place so `enter` and
 * `checkpoint` can never disagree about which ref an agent owns.
 */
const workRefFor = (
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): string =>
	resolveWorkRef(policy.branches.workRefTemplate, {
		agent,
		proposal,
		slice,
		generation: Number(scalarArg(args, 'generation') ?? '1'),
		...(scalarArg(args, 'topic') === undefined
			? {}
			: { topic: scalarArg(args, 'topic') ?? '' }),
	});

/**
 * Give this agent its own working tree on its own ref.
 *
 * WHY a command and not a paragraph of instructions: an agent told "do
 * not edit the shared checkout" needs somewhere else to edit. Without one
 * reachable command it improvises — a branch here, a worktree there —
 * which is exactly the mess this proposal exists to end. Creating the
 * ref, if it does not exist, is done with `update-ref` from the
 * integration branch: the shared checkout never moves.
 */
const entered = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const agent = agentFor(args);
	if (proposal === undefined || slice === undefined || agent.length === 0) {
		return refused(
			'A worktree belongs to one identity and one unit of work.',
			'work enter --proposal=<id> --slice=<id> [--agent=<who>] [--generation=<n>] [--topic=<text>] [--dir=<path>]; --agent defaults to DELENDAI_AGENT_ID.',
		);
	}
	if (policy.branches.workRefTemplate.length === 0) {
		return refused(
			`The \`${policy.profile}\` profile has no work-ref model: it commits to \`${policy.branches.integration}\` directly.`,
			'There is nothing to isolate; edit the checkout as the profile intends.',
		);
	}
	const ref = workRefFor(args, policy, agent, proposal, slice);
	const branch = ref.replace(/^refs\/heads\//u, '');
	const base = integrationBase(root, policy);
	if (base === undefined) {
		return refused(
			`The integration branch \`${policy.branches.integration}\` resolves to no commit in this clone.`,
			'Fetch it (git fetch), or correct development.branches.integration.',
		);
	}
	const existing = git(root, ['worktree', 'list', '--porcelain']) ?? '';
	const known = existing
		.split('\n\n')
		.find((block) => block.includes(`branch ${ref}`));
	if (known !== undefined) {
		const path = known
			.split('\n')
			.find((line) => line.startsWith('worktree '))
			?.slice('worktree '.length);
		return {
			code: EXIT_CODE.OK,
			data: { ref, branch, path: path ?? null, created: false },
		};
	}
	if (git(root, ['rev-parse', '-q', '--verify', ref]) === undefined) {
		// From the integration branch, by plumbing: no checkout moves.
		if (git(root, ['update-ref', ref, base]) === undefined) {
			return refused(
				`Could not create ${ref}.`,
				'Inspect the repository; nothing was changed.',
			);
		}
	}
	const dir =
		scalarArg(args, 'dir') ??
		`${scalarArg(args, 'worktrees') ?? '.cache/delendai/.worktrees'}/${sanitizeRefComponent(`${proposal}-${slice}`)}`;
	const added = git(root, ['worktree', 'add', dir, branch]);
	if (added === undefined) {
		return refused(
			`Could not add a worktree for ${branch} at ${dir}.`,
			'Check that the path is free and that the branch is not already checked out elsewhere.',
		);
	}
	return {
		code: EXIT_CODE.OK,
		data: { ref, branch, path: `${root}/${dir}`, created: true },
	};
};

/**
 * Hand the work over: the publication ref carries it, and the work ref
 * stops existing. The two halves belong together — doing only the first
 * is what fills a namespace with `wip/` branches that look alive.
 */
const published = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
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
	const workRef = workRefFor(args, policy, agent, proposal, slice);
	const publicationRef = publicationRefFromWorkRef(policy, workRef);
	if (publicationRef === undefined) {
		return refused(
			`\`${workRef}\` is not under this policy's work-ref prefix \`${policy.branches.workRefPrefix}\`.`,
			'A publication keeps the name of the work it publishes; a ref outside the namespace has no name to keep.',
		);
	}
	const outcome = publishWorkRef({
		root,
		cwd: ctx.cwd,
		workRef,
		publicationRef,
		remote: scalarArg(args, 'remote') ?? integrationRemote(root, policy),
		keepWorkRef: args.includes('--keep-work-ref'),
	});
	return {
		// Published but not cleaned up is not a success: the namespace is
		// left carrying a ref that looks like live work.
		code:
			outcome.published &&
			(outcome.workRefRemoved || args.includes('--keep-work-ref'))
				? EXIT_CODE.OK
				: EXIT_CODE.VALIDATION,
		data: outcome,
	};
};

/**
 * What everyone else is doing, before the first edit.
 *
 * A claim is consulted when a write is attempted, which is after the
 * work exists; this answers the question that avoids the collision
 * instead of detecting it.
 */
const swarm = async (ctx: ICliCommandContext): Promise<ICliCommandResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const view = readSwarm({ root: opened.root, policy: opened.policy });
	if (ctx.globals.json || ctx.globals.format === 'json') {
		return { code: EXIT_CODE.OK, data: view };
	}
	const lines = [
		`integration      ${view.integration}`,
		`units of work    ${String(view.units.length)}`,
		...view.units.map(
			(unit) =>
				`  ${unit.agent}  ${unit.subject}  +${String(unit.ahead)}/-${String(unit.behind)}  ${String(unit.paths.length)} path(s)`,
		),
		`publications     ${String(view.publications.length)}`,
		...view.publications.map((name) => `  ${name}`),
		...(view.overlaps.length === 0
			? ['overlaps         none']
			: [
					`overlaps         ${String(view.overlaps.length)} path(s) more than one unit of work is changing:`,
					...view.overlaps.map(
						(overlap) =>
							`  ${overlap.path} — ${overlap.refs.join(', ')}`,
					),
				]),
	];
	process.stdout.write(`${lines.join('\n')}\n`);
	return { code: EXIT_CODE.OK, data: view, suppressDefaultPrint: true };
};

/**
 * Take over a unit of work somebody else started, by renaming its ref.
 *
 * A work ref is named after who owns it, so a ref one agent abandoned
 * and another is finishing is a ref that lies — and every question the
 * naming scheme exists to answer gets the wrong answer. Renaming is
 * mechanical, so the machine does it; a rule that depends on an LLM
 * remembering is a rule this project keeps finding broken.
 */
const claimed = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
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
	const sha = git(opened.root, ['rev-parse', ref]);
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
	process.stdout.write(
		`${[
			`claimed  ${result.from}`,
			`      →  ${result.to}`,
			`         ${result.sha} — the same commit, a different name`,
			`         was ${result.heldBy}, now ${result.claimedBy}, generation ${String(result.generation)}`,
		].join('\n')}\n`,
	);
	return { code: EXIT_CODE.OK, data: result, suppressDefaultPrint: true };
};

/**
 * Ask whether the work-ref model is actually holding.
 *
 * Read-only by construction: a checker that also repairs cannot be run
 * to find out whether repair was needed.
 */
const doctored = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
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

const checkpointed = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const opened = await openWork(ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const message = scalarArg(args, 'message');
	const paths = (scalarArg(args, 'paths') ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	const agent = agentFor(args);
	if (
		proposal === undefined ||
		slice === undefined ||
		message === undefined ||
		paths.length === 0 ||
		agent.length === 0
	) {
		return refused(
			'A checkpoint needs an identity, a scope and a message.',
			'work checkpoint --proposal=<id> --slice=<id> --paths=<a,b> --message="..." [--agent=<who>] [--generation=<n>] [--topic=<text>]; --agent defaults to DELENDAI_AGENT_ID.',
		);
	}
	if (policy.branches.workRefTemplate.length === 0) {
		return refused(
			`The \`${policy.profile}\` profile has no work-ref model: it commits to \`${policy.branches.integration}\` directly.`,
			'Commit normally, or switch the project to a profile that isolates work in refs.',
		);
	}
	const scope = validateScopePaths(paths);
	if (scope.invalid.length > 0) {
		return refused(
			`Invalid scope: ${scope.invalid.map((entry) => `${entry.path} (${entry.reason})`).join(', ')}.`,
			'Use repository-relative paths, without traversal and without .git.',
		);
	}
	// The anchor is the whole point: a checkpoint taken while the shared
	// checkout sits somewhere else would record a base nobody agreed on.
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	if (anchor !== undefined) {
		return refused(
			`The checkout is not anchored: ${anchor}`,
			`Return the shared checkout to \`${policy.branches.integration}\` (git switch ${policy.branches.integration}); your work stays in the working tree and in its ref.`,
		);
	}
	const base = integrationBase(root, policy);
	if (base === undefined) {
		return refused(
			`The integration branch \`${policy.branches.integration}\` resolves to no commit in this clone.`,
			'Fetch it (git fetch), or correct development.branches.integration.',
		);
	}
	const ref = workRefFor(args, policy, agent, proposal, slice);
	const result = await engine.createOrUpdateWipRef({
		baseSha: base,
		paths: scope.valid,
		ref,
		message,
		...(args.includes('--allow-scope-narrowing')
			? { allowScopeNarrowing: true }
			: {}),
	});
	// `unchanged` is a true answer, not a failure: the scope still hashes
	// to what the ref already carries.
	const ok = result.status === 'created' || result.status === 'unchanged';
	return {
		code: ok ? EXIT_CODE.OK : EXIT_CODE.VALIDATION,
		data: result,
	};
};

export const createWorkCommand = (): ICliCommand => ({
	name: 'work',
	summary:
		'Persist work to its own ref without moving the shared checkout, and report whether the checkout is where the policy requires.',
	usage: 'work <status|swarm|doctor|claim|enter|checkpoint|publish> [--proposal=<id>] [--slice=<id>] [--paths=<a,b>] [--message=<text>] [--agent=<who>] [--generation=<n>] [--topic=<text>] [--workspace=<path>]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const sub = args[0];
		if (sub === 'status' || sub === undefined) return statusOf(ctx);
		if (sub === 'checkpoint') return checkpointed(args, ctx);
		if (sub === 'enter') return entered(args, ctx);
		if (sub === 'publish') return published(args, ctx);
		if (sub === 'swarm') return swarm(ctx);
		if (sub === 'doctor') return doctored(args, ctx);
		if (sub === 'claim') return claimed(args, ctx);
		return {
			code: EXIT_CODE.VALIDATION,
			error: `Unknown subcommand '${sub}'. Use status, swarm, enter, checkpoint or publish.`,
		};
	},
});

export const workCommand: ICliCommand = createWorkCommand();
