/**
 * work-unit-shared — part of the unit-of-work engine (see work-unit.service.ts).
 */
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

import { anchorFromPolicy, createWipEngine } from '../wip-engine/index';
import { resolveWorkAgentId } from '../work-identity/resolve-work-agent.service';
import { resolveWorkRef } from '../wip-engine/ref-name';
import type { IResolvedDevelopmentPolicy } from '../contracts/interfaces/development-policy.interface';
import {
	isWorkKind,
	isHostApplicationId,
	kindsInAgentId,
	legacyWorkKind,
} from '../development-policy/work-ref-placeholders';
import { WORK_KINDS } from '../development-policy/profiles.constant';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type {
	IWorkContext,
	IWorkUnitContext,
	IWorkUnitResult,
} from '../contracts/interfaces/work-unit-context.interface';
import { readWorkspacePolicy } from './development-policy.service';
import { scalarArg } from './command-args.helper';
import {
	stampWorktreeAgent,
	worktreeAgent,
	worktreeSession,
} from './worktree-agent.service';

/** Read-only git, for the facts the engine does not already answer. */
/** The forge's CLI (`gh`), trimmed output or `undefined` on failure. */
export const forgeCli = (
	cwd: string,
	args: readonly string[],
): string | undefined => {
	try {
		return execFileSync('gh', [...args], {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
		}).trim();
	} catch {
		return undefined;
	}
};

export const readGit = (
	cwd: string,
	args: readonly string[],
): string | undefined => {
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
 * Read-only git, output untouched. Porcelain status is column-aligned:
 * trimming it eats the leading space of a ` M path` entry.
 */
export const gitVerbatim = (
	cwd: string,
	args: readonly string[],
): string | undefined => {
	try {
		return execFileSync('git', args, {
			cwd,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			maxBuffer: 16 * 1024 * 1024,
		});
	} catch {
		return undefined;
	}
};

/**
 * Who this invocation is working as. One resolver for the whole system
 * (x00560): an explicit `--agent`, then what the environment declares,
 * and never the machine — a ref named after a computer says who owns the
 * hardware, not who did the work.
 */
export const agentFor = (args: readonly string[]): string => {
	const identity = resolveWorkAgentId({
		...(scalarArg(args, 'agent') === undefined
			? {}
			: { model: scalarArg(args, 'agent') }),
		environment: process.env.DELENDAI_AGENT_ID,
	});
	return identity.source === 'none' ? '' : identity.id;
};

export const workspaceOf = (ctx: IWorkUnitContext): string =>
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
export const integrationRemote = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): string => {
	const tracked = readGit(cwd, [
		'config',
		'--get',
		`branch.${policy.branches.integration}.remote`,
	]);
	if (tracked !== undefined && tracked.length > 0) return tracked;
	const remotes = (readGit(cwd, ['remote']) ?? '')
		.split('\n')
		.map((name) => name.trim())
		.filter((name) => name.length > 0);
	if (remotes.includes('origin')) return 'origin';
	return remotes[0] ?? 'origin';
};

export const integrationBase = (
	cwd: string,
	policy: IResolvedDevelopmentPolicy,
): string | undefined => {
	const branch = policy.branches.integration;
	const remote = integrationRemote(cwd, policy);
	for (const candidate of [branch, `refs/remotes/${remote}/${branch}`]) {
		const sha = readGit(cwd, [
			'rev-parse',
			'-q',
			'--verify',
			`${candidate}^{commit}`,
		]);
		if (sha !== undefined && sha.length > 0) return sha;
	}
	return undefined;
};

export const refused = (reason: string, remedy: string): IWorkUnitResult => ({
	code: EXIT_CODE.VALIDATION,
	error: `${reason}\n${remedy}`,
});

export const openWork = async (
	ctx: IWorkUnitContext,
): Promise<IWorkContext | IWorkUnitResult> => {
	const root = workspaceOf(ctx);
	const policy = await readWorkspacePolicy(root);
	const engine = await createWipEngine(root, anchorFromPolicy(policy));
	if (engine === undefined) {
		return refused(
			`${root} is not inside a git working tree.`,
			'Run this from the repository, or pass --workspace=<path>.',
		);
	}
	return { root, policy, engine };
};

/**
 * What to do about edits no work ref holds. Listed by path, because
 * "you have undurable work" is only actionable once it says which.
 */
export const undurableAdvice = (
	undurable: readonly string[],
): readonly string[] =>
	undurable.length === 0
		? []
		: [
				'',
				'These edits exist only in the working tree — no work ref holds them.',
				'If they are yours, checkpoint them to your ref:',
				`  delendai work checkpoint --proposal=<id> --slice=<id> --paths=<a,b> --message="..."`,
				...undurable.map((path) => `  ${path}`),
			];

/**
 * The ref this identity works in. Kept in one place so `enter` and
 * `checkpoint` can never disagree about which ref an agent owns.
 */
/**
 * The kind of work a unit carries (f00644): `--kind=` when given, else
 * what its slice has always meant — a review round for `review`/`close`,
 * implementation otherwise.
 */
export const kindFor = (args: readonly string[], slice: string): string =>
	scalarArg(args, 'kind') ?? legacyWorkKind(slice);

/**
 * A refusal for an agent id that spells a kind of work, or `undefined`.
 * The agent segment names who works; `…-review-20260926` put the task
 * there, and every such ref read as an agent nobody could recognise.
 */
export const kindInAgent = (agent: string): IWorkUnitResult | undefined => {
	if (isHostApplicationId(agent)) {
		return refused(
			`The agent id \`${agent}\` is the program the agent runs in, not the agent; an agent id names who works — the model (x00694).`,
			'Use the model id as the agent (--agent=<model>, or DELENDAI_AGENT_ID=<model>), e.g. --agent=glm-5 or --agent=minimax-m3.',
		);
	}
	const kinds = kindsInAgentId(agent);
	if (kinds.length === 0) return undefined;
	return refused(
		`The agent id \`${agent}\` spells a kind of work (${kinds.join(', ')}); an agent id names who works — the model.`,
		`Use the model id as the agent (--agent=<model>, or DELENDAI_AGENT_ID=<model>) and name the work with --kind=<${WORK_KINDS.join('|')}>.`,
	);
};

/**
 * The session entering, from `--session` or `DELENDAI_SESSION_ID`.
 *
 * Four MiniMax instances worked as one agent id on 2026-09-27, and
 * `work enter` handed each the unit another already had: the id names
 * the model, and nothing named the instance. The session does (x00699).
 */
export const sessionFor = (args: readonly string[]): string | undefined => {
	const given = scalarArg(args, 'session') ?? process.env.DELENDAI_SESSION_ID;
	return given !== undefined && given.trim().length > 0
		? given.trim()
		: undefined;
};

/**
 * `args`, with the session of the unit the command runs inside when none
 * is given. Agents lose the `--session` `work enter` printed; each call
 * without it read as another session, and `work enter` handed out a new
 * generation every time. One `minimax-3` instance left seven units behind
 * on 2026-09-28, their verdicts never published. Standing in your own
 * unit's worktree is proof enough that it is yours.
 */
export const withSessionOfCwd = (
	args: readonly string[],
	cwd: string,
): readonly string[] => {
	if (sessionFor(args) !== undefined) return args;
	const top = readGit(cwd, ['rev-parse', '--show-toplevel']);
	if (top === undefined) return args;
	const stamped = worktreeSession(top);
	if (stamped === undefined || worktreeAgent(top) !== agentFor(args))
		return args;
	return [...args, `--session=${stamped}`];
};

/** A refusal when another session of this agent holds `path`. */
export const heldByAnother = (
	path: string,
	session: string | undefined,
): IWorkUnitResult | undefined => {
	const held = worktreeSession(path);
	if (held === undefined || held === session) return undefined;
	return refused(
		`${path} is held by another session: the unit is someone else's work, even under the same agent id.`,
		'If this is your unit, pass the --session you were given when you entered it (or set DELENDAI_SESSION_ID). Otherwise enter your own unit: a different --topic, or --generation=<next>.',
	);
};

/** Stamp `path` for this agent and session, issuing a session if none. */
export const claimWorktree = (
	path: string,
	agent: string,
	session: string | undefined,
): string => {
	const claimed =
		session ?? worktreeSession(path) ?? randomUUID().slice(0, 8);
	stampWorktreeAgent(path, agent, claimed);
	return claimed;
};

/** A refusal for a `--kind=` outside the vocabulary, or `undefined`. */
export const unknownKind = (
	args: readonly string[],
): IWorkUnitResult | undefined => {
	const kind = scalarArg(args, 'kind');
	if (kind === undefined || isWorkKind(kind)) return undefined;
	return refused(
		`\`${kind}\` is not a kind of work this project names.`,
		`Pass --kind=<${WORK_KINDS.join('|')}>; a new kind is added to the vocabulary, not typed into a ref.`,
	);
};

export const workRefFor = (
	args: readonly string[],
	policy: IResolvedDevelopmentPolicy,
	agent: string,
	proposal: string,
	slice: string,
): string =>
	resolveWorkRef(policy.branches.workRefTemplate, {
		agent,
		kind: kindFor(args, slice),
		proposal,
		slice,
		generation: Number(scalarArg(args, 'generation') ?? '1'),
		...(scalarArg(args, 'topic') === undefined
			? {}
			: { topic: scalarArg(args, 'topic') ?? '' }),
	});
