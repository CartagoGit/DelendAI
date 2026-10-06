/**
 * f00046 S7 — proposals commands. One subcommand per `proposals_*` MCP
 * tool exposed by the proposals plugin. Pure 1:1 delegation: the CLI
 * maps flags to each tool's public `inputSchema`. Tools that take a
 * structured payload (`plan`, `create` slices) accept a `--json` flag
 * carrying that payload verbatim.
 */
import { EXIT_CODE } from '../../contracts/constants/exit-code.constant';
import type { ICliCommand } from '../../contracts/interfaces/cli-command.interface';
import {
	data,
	hasFlag,
	listArg,
	positionalArg,
	request,
	resolveAgent,
	scalarArg,
	usage,
} from './group-helpers';
import { CRITERION_SEPARATOR } from '../../contracts/constants/review-command.constant';

/**
 * Parse an optional JSON-valued flag into a value, or undefined. Never
 * `--json`: that is the global output switch, which the parser consumes
 * before a command sees its arguments.
 */
const jsonArg = (args: readonly string[], flag: string): unknown => {
	const raw = scalarArg(args, flag);
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return undefined;
	}
};

const autoWorkCommand: ICliCommand = {
	name: 'proposals auto-work',
	flags: ['persist', 'mode'],
	summary: 'Resolve the next proposal and return a compact action plan.',
	async run(args, ctx) {
		const persist = scalarArg(args, 'persist') ?? scalarArg(args, 'mode');
		return data(
			await request(ctx, 'delendai_proposals_auto_work', {
				...(persist !== undefined ? { persist } : {}),
			}),
		);
	},
};

const continueCommand: ICliCommand = {
	name: 'proposals continue',
	flags: ['id', 'mode', 'slice', 'sliceId', 'agent'],
	summary: 'Resolve / plan / claim the next proposal slice.',
	async run(args, ctx) {
		const proposalId = positionalArg(args) ?? scalarArg(args, 'id');
		const mode = scalarArg(args, 'mode');
		const sliceId = scalarArg(args, 'slice') ?? scalarArg(args, 'sliceId');
		// Only a claim is held by someone: the agent it is made for.
		const agentName =
			mode === 'claim' ? await resolveAgent(args, ctx.cwd) : undefined;
		return data(
			await request(ctx, 'delendai_proposals_continue_proposal', {
				...(proposalId !== undefined ? { proposalId } : {}),
				...(mode !== undefined ? { mode } : {}),
				...(sliceId !== undefined ? { sliceId } : {}),
				...(agentName !== undefined ? { agentName } : {}),
				// The claim must outlive this one-shot process.
				...(mode === 'claim' ? { holder: 'agent' } : {}),
			}),
		);
	},
};

const createCommand: ICliCommand = {
	name: 'proposals create',
	flags: ['title', 'kind', 'goal', 'track', 'slices'],
	summary: 'Create a proposal document with a parseable Slices section.',
	async run(args, ctx) {
		const title = scalarArg(args, 'title');
		if (title === undefined) {
			return usage(
				'proposals create --title=<t> [--kind=feat] [--goal=<g>] [--track=<t>] [--slices=<json>]',
			);
		}
		const kind = scalarArg(args, 'kind');
		const goal = scalarArg(args, 'goal');
		const track = scalarArg(args, 'track');
		const slices = jsonArg(args, 'slices');
		return data(
			await request(ctx, 'delendai_proposals_create_proposal', {
				title,
				...(kind !== undefined ? { kind } : {}),
				...(goal !== undefined ? { goal } : {}),
				...(track !== undefined ? { track } : {}),
				...(Array.isArray(slices) ? { slices } : {}),
			}),
		);
	},
};

const CLOSE_SLICE_USAGE =
	'proposals close-slice <proposalId> <sliceId> [--checkout=<unit worktree>]';

/**
 * The checkout a call acts in, when the caller named one. Absent, the
 * tools bind the call to the caller's live unit on their own, exactly as
 * they do for an MCP client.
 */
const checkoutArgs = (args: readonly string[]): { checkout?: string } => {
	const checkout = scalarArg(args, 'checkout');
	return checkout === undefined ? {} : { checkout };
};

const closeSliceCommand: ICliCommand = {
	name: 'proposals close-slice',
	usage: CLOSE_SLICE_USAGE,
	flags: ['checkout'],
	summary:
		'Mark a slice done + release its lock atomically, then re-sync. --checkout names the unit worktree; omitted, the live unit that carries the proposal is used.',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const proposalId = positionals[0];
		const sliceId = positionals[1];
		if (proposalId === undefined || sliceId === undefined) {
			return usage(CLOSE_SLICE_USAGE);
		}
		return data(
			await request(ctx, 'delendai_proposals_close_slice', {
				proposalId,
				sliceId,
				...checkoutArgs(args),
			}),
		);
	},
};

const TRANSITION_USAGE =
	'proposals transition <id> <to> --reason=<why> [--agent=<you>] [--checkout=<unit worktree>]';

const transitionCommand: ICliCommand = {
	name: 'proposals transition',
	usage: TRANSITION_USAGE,
	flags: ['reason', 'agent', 'checkout'],
	summary:
		'Move a proposal to a new status (DFA-validated; requires reason). To review, --agent (or DELENDAI_AGENT_ID) names the implementer and opens the review rounds.',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const id = positionals[0];
		const to = positionals[1];
		const reason = scalarArg(args, 'reason');
		if (id === undefined || to === undefined || reason === undefined) {
			return usage(TRANSITION_USAGE);
		}
		const agent = await resolveAgent(args, ctx.cwd);
		if (to === 'review' && agent === undefined) {
			return usage(
				`${TRANSITION_USAGE} — a hand-off to review needs the implementer, or no review round opens and reviewers never see the proposal: pass --agent=<you> or set DELENDAI_AGENT_ID`,
			);
		}
		return data(
			await request(ctx, 'delendai_proposals_proposal_transition', {
				id,
				to,
				reason,
				...(agent !== undefined ? { agent } : {}),
				...checkoutArgs(args),
			}),
		);
	},
};

const boardCommand: ICliCommand = {
	name: 'proposals board',
	flags: [],
	summary: 'Show each actionable proposal with its slices (verbose).',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_proposal_board', {}),
		);
	},
};

const statusCommand: ICliCommand = {
	name: 'proposals status',
	flags: ['fields'],
	summary: 'Compact proposals state: locks, queue backpressure, counts.',
	async run(args, ctx) {
		const fields = listArg(args, 'fields');
		return data(
			await request(ctx, 'delendai_proposals_compact_status', {
				...(fields !== undefined ? { fields } : {}),
			}),
		);
	},
};

const healthCommand: ICliCommand = {
	name: 'proposals health',
	flags: [],
	summary:
		'Diagnose swarm state (locks, queue, registry) without changing it.',
	async run(_args, ctx) {
		return data(await request(ctx, 'delendai_proposals_state_health', {}));
	},
};

const agentNamesCommand: ICliCommand = {
	name: 'proposals agent-names',
	flags: ['action', 'agent', 'task', 'taskId'],
	summary: 'Agent name registry: assign/release/list/tree/gc/reconcile.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals agent-names --action=list|tree|gc|...');
		}
		const agent = scalarArg(args, 'agent');
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		return data(
			await request(ctx, 'delendai_proposals_agent_names', {
				action,
				...(agent !== undefined ? { agent } : {}),
				...(taskId !== undefined ? { task_id: taskId } : {}),
			}),
		);
	},
};

const lockCommand: ICliCommand = {
	name: 'proposals lock',
	flags: ['action', 'agent', 'task', 'taskId', 'files'],
	summary: 'File write-ownership lock: claim/release/status/gc.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals lock --action=claim|release|status|gc');
		}
		// A claim and its heartbeat are made by someone: the declared
		// agent stands in when none is named.
		const agent =
			action === 'claim' || action === 'heartbeat'
				? await resolveAgent(args, ctx.cwd)
				: scalarArg(args, 'agent');
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		const files = listArg(args, 'files');
		return data(
			await request(ctx, 'delendai_proposals_agent_lock', {
				action,
				...(agent !== undefined ? { agent } : {}),
				...(taskId !== undefined ? { task_id: taskId } : {}),
				...(files !== undefined ? { files } : {}),
				// This process ends with the call: a claim tied to it would
				// be gone before the next command could rely on it.
				...(action === 'claim' ? { holder: 'agent' } : {}),
			}),
		);
	},
};

const worktreeCommand: ICliCommand = {
	name: 'proposals worktree',
	flags: ['action', 'agent', 'base-branch', 'force'],
	summary: 'Per-agent git worktree: create/list/remove (git isolation).',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals worktree --action=create|list|remove');
		}
		const agent = scalarArg(args, 'agent');
		const baseBranch = scalarArg(args, 'base-branch');
		return data(
			await request(ctx, 'delendai_proposals_agent_worktree', {
				action,
				...(agent !== undefined ? { agent } : {}),
				...(baseBranch !== undefined
					? { base_branch: baseBranch }
					: {}),
				...(hasFlag(args, 'force') ? { force: true } : {}),
			}),
		);
	},
};

const staleListCommand: ICliCommand = {
	name: 'proposals stale-list',
	flags: [],
	summary: 'List proposals whose owner emitted agent-dead.',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_proposal_stale_list', {}),
		);
	},
};

const roundContextCommand: ICliCommand = {
	name: 'proposals round-context',
	flags: ['force'],
	summary: 'Return the persisted multi-agent round context (+ staleness).',
	async run(args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_round_context', {
				...(hasFlag(args, 'force') ? { forceRefresh: true } : {}),
			}),
		);
	},
};

const workflowCommand: ICliCommand = {
	name: 'proposals workflow',
	flags: [],
	summary: 'Return the proposal workflow (families, locations, template).',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_get_proposal_workflow', {}),
		);
	},
};

const diagnoseCommand: ICliCommand = {
	name: 'proposals diagnose',
	flags: [],
	summary: 'Diagnose a proposal: folder, status, lock owners, recovery.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined) return usage('proposals diagnose <id>');
		return data(
			await request(ctx, 'delendai_proposals_proposal_diagnose', {
				id,
			}),
		);
	},
};

const adoptCommand: ICliCommand = {
	name: 'proposals adopt',
	flags: ['dir'],
	summary: 'Make a proposals folder followable (read-only plan).',
	async run(args, ctx) {
		const dir = scalarArg(args, 'dir');
		return data(
			await request(ctx, 'delendai_proposals_proposal_adopt', {
				...(dir !== undefined ? { dir } : {}),
			}),
		);
	},
};

const forceTransitionCommand: ICliCommand = {
	name: 'proposals force-transition',
	flags: ['reason'],
	summary: 'Force a proposal to a recovery status (requires reason).',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const id = positionals[0];
		const to = positionals[1];
		const reason = scalarArg(args, 'reason');
		if (id === undefined || to === undefined || reason === undefined) {
			return usage('proposals force-transition <id> <to> --reason=<why>');
		}
		return data(
			await request(ctx, 'delendai_proposals_proposal_force_transition', {
				id,
				to,
				reason,
			}),
		);
	},
};

const reconcileFolderCommand: ICliCommand = {
	name: 'proposals reconcile-folder',
	flags: ['dry-run'],
	summary: 'Move a proposal file to the folder matching its status.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined)
			return usage('proposals reconcile-folder <id> [--dry-run]');
		return data(
			await request(ctx, 'delendai_proposals_proposal_reconcile_folder', {
				id,
				...(hasFlag(args, 'dry-run') ? { dryRun: true } : {}),
			}),
		);
	},
};

const stateRepairCommand: ICliCommand = {
	name: 'proposals state-repair',
	flags: ['execute'],
	summary: 'Auto-heal stale swarm state (dry-run unless --execute).',
	async run(args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_state_repair', {
				mode: hasFlag(args, 'execute') ? 'execute' : 'dry-run',
			}),
		);
	},
};

const releaseOrphanCommand: ICliCommand = {
	name: 'proposals release-orphan',
	flags: ['reason'],
	summary: 'Release an orphan task lock (only with an agent-dead event).',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const taskId = positionals[0];
		const agent = positionals[1];
		const reason = scalarArg(args, 'reason');
		if (
			taskId === undefined ||
			agent === undefined ||
			reason === undefined
		) {
			return usage(
				'proposals release-orphan <taskId> <agent> --reason=<why>',
			);
		}
		return data(
			await request(ctx, 'delendai_proposals_agent_lock_release_orphan', {
				taskId,
				agent,
				reason,
			}),
		);
	},
};

/** A non-negative integer flag, or undefined when absent or malformed. */
const integerArg = (
	args: readonly string[],
	name: string,
): number | undefined => {
	const raw = scalarArg(args, name);
	if (raw === undefined || !/^\d+$/u.test(raw)) return undefined;
	return Number.parseInt(raw, 10);
};

/**
 * The evidence an approval carries, from flags. Absent unless at least
 * one evidence flag was given, so a submit or a status call sends none.
 */
/**
 * Every `--criterion="<criterion> => <evidence>"`, in order. A slice that
 * declares acceptance criteria is approved only with evidence for each,
 * and the command line had no way to give it: from a shell, no such slice
 * could be approved at all.
 */
const criteriaArgs = (
	args: readonly string[],
): readonly { readonly criterion: string; readonly evidence: string }[] =>
	args
		.filter((arg) => arg.startsWith('--criterion='))
		.map((arg) => arg.slice('--criterion='.length))
		.map((value) => {
			// The first separator: evidence is free text, a criterion is not.
			const at = value.indexOf(CRITERION_SEPARATOR);
			return at < 0
				? { criterion: value.trim(), evidence: '' }
				: {
						criterion: value.slice(0, at).trim(),
						evidence: value
							.slice(at + CRITERION_SEPARATOR.length)
							.trim(),
					};
		});

export const evidenceArgs = (
	args: readonly string[],
): Record<string, unknown> | undefined => {
	const criteria = criteriaArgs(args);
	const evidence = {
		...(criteria.length === 0 ? {} : { acceptanceCriteria: criteria }),
		...(scalarArg(args, 'commit') === undefined
			? {}
			: { commitHash: scalarArg(args, 'commit') }),
		...(integerArg(args, 'validate-exit') === undefined
			? {}
			: { validateExitCode: integerArg(args, 'validate-exit') }),
		...(integerArg(args, 'tests-passing') === undefined
			? {}
			: { testsPassing: integerArg(args, 'tests-passing') }),
		...(integerArg(args, 'tests-total') === undefined
			? {}
			: { testsTotal: integerArg(args, 'tests-total') }),
	};
	return Object.keys(evidence).length === 0 ? undefined : evidence;
};

const REVIEW_USAGE =
	'proposals review <proposalId> <sliceId> --action=<submit|approve|request_changes|status> --agent=<who> [--note=<n>] [--commit=<sha>] [--validate-exit=0 --tests-passing=<n> --tests-total=<n>] [--criterion="<criterion> => <evidence>" …]';

const reviewCommand: ICliCommand = {
	name: 'proposals review',
	usage: REVIEW_USAGE,
	flags: [
		'action',
		'agent',
		'note',
		'commit',
		'validate-exit',
		'tests-passing',
		'tests-total',
		'criterion',
	],
	summary:
		'Peer-review a slice: submit/approve/request_changes/status. --commit names the delivering commit (and opens the round a delivery never opened); approve also needs --validate-exit, --tests-passing and --tests-total.',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const proposalId = positionals[0];
		const sliceId = positionals[1];
		const action = scalarArg(args, 'action');
		const agent = scalarArg(args, 'agent');
		if (
			proposalId === undefined ||
			sliceId === undefined ||
			action === undefined ||
			agent === undefined
		) {
			return usage(REVIEW_USAGE);
		}
		const note = scalarArg(args, 'note');
		const commit = scalarArg(args, 'commit');
		const evidence = action === 'approve' ? evidenceArgs(args) : undefined;
		return data(
			await request(ctx, 'delendai_proposals_proposal_review', {
				proposalId,
				sliceId,
				action,
				agent,
				...(note !== undefined ? { note } : {}),
				...(commit !== undefined ? { commitHash: commit } : {}),
				...(evidence !== undefined ? { evidence } : {}),
			}),
		);
	},
};

const reviewQueueCommand: ICliCommand = {
	name: 'proposals review-queue',
	usage: 'proposals review-queue [--proposal=<id>] [--limit=<n>] [--offset=<n>] [--agent=<you>] [--detail]',
	flags: ['proposal', 'limit', 'offset', 'agent', 'detail'],
	summary:
		'The proposals waiting in review, oldest first, with what each slice needs from a reviewer. Start here when asked to review proposals.',
	async run(args, ctx) {
		const proposalId = scalarArg(args, 'proposal');
		const limit = integerArg(args, 'limit');
		const offset = integerArg(args, 'offset');
		const agent = scalarArg(args, 'agent');
		return data(
			await request(ctx, 'delendai_proposals_review_queue', {
				...(proposalId !== undefined ? { proposalId } : {}),
				...(limit !== undefined ? { limit } : {}),
				...(offset !== undefined ? { offset } : {}),
				...(agent !== undefined ? { agent } : {}),
				...(hasFlag(args, 'detail') ? { detail: true } : {}),
			}),
		);
	},
};

const syncCommand: ICliCommand = {
	name: 'proposals sync',
	flags: [],
	summary: 'Regenerate the proposal index from the proposals tree.',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'delendai_proposals_sync_proposals', {}),
		);
	},
};

const taskQueueCommand: ICliCommand = {
	name: 'proposals task-queue',
	flags: ['action', 'params'],
	summary: 'Swarm coordination queue: enqueue/dequeue/subscribe/report.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage(
				'proposals task-queue --action=enqueue|dequeue|subscribe|report [--params=<json>]',
			);
		}
		const params = jsonArg(args, 'params');
		return data(
			await request(ctx, 'delendai_proposals_task_queue', {
				action,
				...(params !== undefined && typeof params === 'object'
					? { params }
					: {}),
			}),
		);
	},
};

const delegateCommand: ICliCommand = {
	name: 'proposals delegate',
	flags: ['task', 'slot', 'files', 'topic', 'agent'],
	summary: 'Delegate a slice to a subagent (assign name + claim files).',
	async run(args, ctx) {
		const taskId = positionalArg(args) ?? scalarArg(args, 'task');
		const slot = scalarArg(args, 'slot');
		const files = listArg(args, 'files');
		if (taskId === undefined || slot === undefined || files === undefined) {
			return usage(
				'proposals delegate <taskId> --slot=<role> --files=a,b',
			);
		}
		const topic = scalarArg(args, 'topic');
		const agentName = scalarArg(args, 'agent');
		return data(
			await request(ctx, 'delendai_proposals_delegate', {
				taskId,
				slot,
				files,
				// The claim must outlive this one-shot process.
				holder: 'agent',
				...(topic !== undefined ? { topic } : {}),
				...(agentName !== undefined ? { agentName } : {}),
			}),
		);
	},
};

const planCommand: ICliCommand = {
	name: 'proposals plan',
	flags: ['slices', 'proposal'],
	summary: 'Validate proposed slices into a parallel plan (disjointness).',
	async run(args, ctx) {
		const slices = jsonArg(args, 'slices');
		if (!Array.isArray(slices)) {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: proposals plan --slices=\'[{"sliceId":"S1","files":[...]}]\' [--proposal=<id>]',
			};
		}
		const proposalId = scalarArg(args, 'proposal');
		return data(
			await request(ctx, 'proposals_plan', {
				slices,
				...(proposalId !== undefined ? { proposalId } : {}),
			}),
		);
	},
};

export const proposalsCommands: readonly ICliCommand[] = [
	autoWorkCommand,
	continueCommand,
	createCommand,
	closeSliceCommand,
	transitionCommand,
	boardCommand,
	statusCommand,
	healthCommand,
	agentNamesCommand,
	lockCommand,
	worktreeCommand,
	staleListCommand,
	roundContextCommand,
	workflowCommand,
	diagnoseCommand,
	adoptCommand,
	forceTransitionCommand,
	reconcileFolderCommand,
	stateRepairCommand,
	releaseOrphanCommand,
	reviewCommand,
	reviewQueueCommand,
	syncCommand,
	taskQueueCommand,
	delegateCommand,
	planCommand,
];
