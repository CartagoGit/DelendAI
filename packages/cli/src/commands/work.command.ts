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
	observeAnchor,
	resolveWorkRef,
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

const workspaceOf = (
	ctx: ICliCommandContext,
	args: readonly string[],
): string => scalarArg(args, 'workspace') ?? ctx.cwd;

const currentBranch = (cwd: string): string | undefined => {
	const name = git(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']);
	return name === undefined || name.length === 0 ? undefined : name;
};

/**
 * The commit a checkpoint is based on: the integration branch as this
 * clone currently sees it, local first, then its remote-tracking copy.
 * Never `HEAD` — a checkpoint says "the integration branch, plus exactly
 * my paths", and `HEAD` may be anywhere.
 */
const integrationBase = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	const branch = policy.branches.integration;
	for (const candidate of [branch, `refs/remotes/origin/${branch}`]) {
		const sha = git(cwd, ['rev-parse', '-q', '--verify', `${candidate}^{commit}`]);
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
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<IWorkContext | ICliCommandResult> => {
	const root = workspaceOf(ctx, args);
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
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const opened = await openWork(args, ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const anchor = anchorRefusal(
		await observeAnchor(engine.context.run, anchorFromPolicy(policy)),
	);
	const branch = currentBranch(root);
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

const checkpointed = async (
	args: readonly string[],
	ctx: ICliCommandContext,
): Promise<ICliCommandResult> => {
	const opened = await openWork(args, ctx);
	if (!('engine' in opened)) return opened;
	const { root, policy, engine } = opened;
	const proposal = scalarArg(args, 'proposal');
	const slice = scalarArg(args, 'slice');
	const message = scalarArg(args, 'message');
	const paths = (scalarArg(args, 'paths') ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	const agent =
		scalarArg(args, 'agent') ?? process.env.DELENDAI_AGENT_ID ?? '';
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
			'Fetch it (git fetch origin), or correct development.branches.integration.',
		);
	}
	const ref = resolveWorkRef(policy.branches.workRefTemplate, {
		agent,
		proposal,
		slice,
		generation: Number(scalarArg(args, 'generation') ?? '1'),
		...(scalarArg(args, 'topic') === undefined
			? {}
			: { topic: scalarArg(args, 'topic') as string }),
	});
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
	usage: 'work <status|checkpoint> [--proposal=<id>] [--slice=<id>] [--paths=<a,b>] [--message=<text>] [--agent=<who>] [--generation=<n>] [--topic=<text>] [--workspace=<path>]',
	async run(args, ctx): Promise<ICliCommandResult> {
		const sub = args[0];
		if (sub === 'status' || sub === undefined) return statusOf(args, ctx);
		if (sub === 'checkpoint') return checkpointed(args, ctx);
		return {
			code: EXIT_CODE.VALIDATION,
			error: `Unknown subcommand '${sub}'. Use status or checkpoint.`,
		};
	},
});

export const workCommand: ICliCommand = createWorkCommand();
