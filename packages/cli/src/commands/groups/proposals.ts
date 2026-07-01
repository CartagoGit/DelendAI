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
	scalarArg,
	usage,
} from './group-helpers';

/** Parse an optional `--json=<payload>` flag into a value, or undefined. */
const jsonArg = (args: readonly string[]): unknown => {
	const raw = scalarArg(args, 'json');
	if (raw === undefined) return undefined;
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return undefined;
	}
};

const autoWorkCommand: ICliCommand = {
	name: 'proposals auto-work',
	summary: 'Resolve the next proposal and return a compact action plan.',
	async run(args, ctx) {
		const persist = scalarArg(args, 'persist') ?? scalarArg(args, 'mode');
		return data(
			await request(ctx, 'mcp-vertex_proposals_auto_work', {
				...(persist !== undefined ? { persist } : {}),
			}),
		);
	},
};

const continueCommand: ICliCommand = {
	name: 'proposals continue',
	summary: 'Resolve / plan / claim the next proposal slice.',
	async run(args, ctx) {
		const proposalId = positionalArg(args) ?? scalarArg(args, 'id');
		const mode = scalarArg(args, 'mode');
		const sliceId = scalarArg(args, 'slice') ?? scalarArg(args, 'sliceId');
		return data(
			await request(ctx, 'mcp-vertex_proposals_continue_proposal', {
				...(proposalId !== undefined ? { proposalId } : {}),
				...(mode !== undefined ? { mode } : {}),
				...(sliceId !== undefined ? { sliceId } : {}),
			}),
		);
	},
};

const createCommand: ICliCommand = {
	name: 'proposals create',
	summary: 'Create a proposal document with a parseable Slices section.',
	async run(args, ctx) {
		const title = scalarArg(args, 'title');
		if (title === undefined) {
			return usage(
				'proposals create --title=<t> [--kind=feat] [--goal=<g>] [--track=<t>] [--json=<slices>]',
			);
		}
		const kind = scalarArg(args, 'kind');
		const goal = scalarArg(args, 'goal');
		const track = scalarArg(args, 'track');
		const slices = jsonArg(args);
		return data(
			await request(ctx, 'mcp-vertex_proposals_create_proposal', {
				title,
				...(kind !== undefined ? { kind } : {}),
				...(goal !== undefined ? { goal } : {}),
				...(track !== undefined ? { track } : {}),
				...(Array.isArray(slices) ? { slices } : {}),
			}),
		);
	},
};

const closeSliceCommand: ICliCommand = {
	name: 'proposals close-slice',
	summary: 'Mark a slice done + release its lock atomically, then re-sync.',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const proposalId = positionals[0];
		const sliceId = positionals[1];
		if (proposalId === undefined || sliceId === undefined) {
			return usage('proposals close-slice <proposalId> <sliceId>');
		}
		return data(
			await request(ctx, 'mcp-vertex_proposals_close_slice', {
				proposalId,
				sliceId,
			}),
		);
	},
};

const transitionCommand: ICliCommand = {
	name: 'proposals transition',
	summary:
		'Move a proposal to a new status (DFA-validated; requires reason).',
	async run(args, ctx) {
		const positionals = args.filter((a) => !a.startsWith('-'));
		const id = positionals[0];
		const to = positionals[1];
		const reason = scalarArg(args, 'reason');
		if (id === undefined || to === undefined || reason === undefined) {
			return usage('proposals transition <id> <to> --reason=<why>');
		}
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_transition', {
				id,
				to,
				reason,
			}),
		);
	},
};

const boardCommand: ICliCommand = {
	name: 'proposals board',
	summary: 'Show each actionable proposal with its slices (verbose).',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_board', {}),
		);
	},
};

const statusCommand: ICliCommand = {
	name: 'proposals status',
	summary: 'Compact proposals state: locks, queue backpressure, counts.',
	async run(args, ctx) {
		const fields = listArg(args, 'fields');
		return data(
			await request(ctx, 'mcp-vertex_proposals_compact_status', {
				...(fields !== undefined ? { fields } : {}),
			}),
		);
	},
};

const healthCommand: ICliCommand = {
	name: 'proposals health',
	summary:
		'Diagnose swarm state (locks, queue, registry) without changing it.',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_state_health', {}),
		);
	},
};

const agentNamesCommand: ICliCommand = {
	name: 'proposals agent-names',
	summary: 'Agent name registry: assign/release/list/tree/gc/reconcile.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals agent-names --action=list|tree|gc|...');
		}
		const agent = scalarArg(args, 'agent');
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		return data(
			await request(ctx, 'mcp-vertex_proposals_agent_names', {
				action,
				...(agent !== undefined ? { agent } : {}),
				...(taskId !== undefined ? { task_id: taskId } : {}),
			}),
		);
	},
};

const lockCommand: ICliCommand = {
	name: 'proposals lock',
	summary: 'File write-ownership lock: claim/release/status/gc.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals lock --action=claim|release|status|gc');
		}
		const agent = scalarArg(args, 'agent');
		const taskId = scalarArg(args, 'task') ?? scalarArg(args, 'taskId');
		const files = listArg(args, 'files');
		return data(
			await request(ctx, 'mcp-vertex_proposals_agent_lock', {
				action,
				...(agent !== undefined ? { agent } : {}),
				...(taskId !== undefined ? { task_id: taskId } : {}),
				...(files !== undefined ? { files } : {}),
			}),
		);
	},
};

const worktreeCommand: ICliCommand = {
	name: 'proposals worktree',
	summary: 'Per-agent git worktree: create/list/remove (git isolation).',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage('proposals worktree --action=create|list|remove');
		}
		const agent = scalarArg(args, 'agent');
		const baseBranch = scalarArg(args, 'base-branch');
		return data(
			await request(ctx, 'mcp-vertex_proposals_agent_worktree', {
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
	summary: 'List proposals whose owner emitted agent-dead.',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_stale_list', {}),
		);
	},
};

const roundContextCommand: ICliCommand = {
	name: 'proposals round-context',
	summary: 'Return the persisted multi-agent round context (+ staleness).',
	async run(args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_round_context', {
				...(hasFlag(args, 'force') ? { forceRefresh: true } : {}),
			}),
		);
	},
};

const workflowCommand: ICliCommand = {
	name: 'proposals workflow',
	summary: 'Return the proposal workflow (families, locations, template).',
	async run(_args, ctx) {
		return data(
			await request(
				ctx,
				'mcp-vertex_proposals_get_proposal_workflow',
				{},
			),
		);
	},
};

const diagnoseCommand: ICliCommand = {
	name: 'proposals diagnose',
	summary: 'Diagnose a proposal: folder, status, lock owners, recovery.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined) return usage('proposals diagnose <id>');
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_diagnose', {
				id,
			}),
		);
	},
};

const adoptCommand: ICliCommand = {
	name: 'proposals adopt',
	summary: 'Make a proposals folder followable (read-only plan).',
	async run(args, ctx) {
		const dir = scalarArg(args, 'dir');
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_adopt', {
				...(dir !== undefined ? { dir } : {}),
			}),
		);
	},
};

const forceTransitionCommand: ICliCommand = {
	name: 'proposals force-transition',
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
			await request(
				ctx,
				'mcp-vertex_proposals_proposal_force_transition',
				{
					id,
					to,
					reason,
				},
			),
		);
	},
};

const reconcileFolderCommand: ICliCommand = {
	name: 'proposals reconcile-folder',
	summary: 'Move a proposal file to the folder matching its status.',
	async run(args, ctx) {
		const id = positionalArg(args);
		if (id === undefined)
			return usage('proposals reconcile-folder <id> [--dry-run]');
		return data(
			await request(
				ctx,
				'mcp-vertex_proposals_proposal_reconcile_folder',
				{
					id,
					...(hasFlag(args, 'dry-run') ? { dryRun: true } : {}),
				},
			),
		);
	},
};

const stateRepairCommand: ICliCommand = {
	name: 'proposals state-repair',
	summary: 'Auto-heal stale swarm state (dry-run unless --execute).',
	async run(args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_state_repair', {
				mode: hasFlag(args, 'execute') ? 'execute' : 'dry-run',
			}),
		);
	},
};

const releaseOrphanCommand: ICliCommand = {
	name: 'proposals release-orphan',
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
			await request(
				ctx,
				'mcp-vertex_proposals_agent_lock_release_orphan',
				{
					taskId,
					agent,
					reason,
				},
			),
		);
	},
};

const reviewCommand: ICliCommand = {
	name: 'proposals review',
	summary: 'Peer-review a slice: submit/approve/request_changes/status.',
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
			return usage(
				'proposals review <proposalId> <sliceId> --action=<a> --agent=<who> [--note=<n>]',
			);
		}
		const note = scalarArg(args, 'note');
		return data(
			await request(ctx, 'mcp-vertex_proposals_proposal_review', {
				proposalId,
				sliceId,
				action,
				agent,
				...(note !== undefined ? { note } : {}),
			}),
		);
	},
};

const syncCommand: ICliCommand = {
	name: 'proposals sync',
	summary: 'Regenerate the proposal index from the proposals tree.',
	async run(_args, ctx) {
		return data(
			await request(ctx, 'mcp-vertex_proposals_sync_proposals', {}),
		);
	},
};

const taskQueueCommand: ICliCommand = {
	name: 'proposals task-queue',
	summary: 'Swarm coordination queue: enqueue/dequeue/subscribe/report.',
	async run(args, ctx) {
		const action = scalarArg(args, 'action') ?? positionalArg(args);
		if (action === undefined) {
			return usage(
				'proposals task-queue --action=enqueue|dequeue|subscribe|report [--json=<params>]',
			);
		}
		const params = jsonArg(args);
		return data(
			await request(ctx, 'mcp-vertex_proposals_task_queue', {
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
			await request(ctx, 'mcp-vertex_proposals_delegate', {
				taskId,
				slot,
				files,
				...(topic !== undefined ? { topic } : {}),
				...(agentName !== undefined ? { agentName } : {}),
			}),
		);
	},
};

const planCommand: ICliCommand = {
	name: 'proposals plan',
	summary: 'Validate proposed slices into a parallel plan (disjointness).',
	async run(args, ctx) {
		const slices = jsonArg(args);
		if (!Array.isArray(slices)) {
			return {
				code: EXIT_CODE.USAGE,
				error: 'usage: proposals plan --json=\'[{"sliceId":"S1","files":[...]}]\' [--proposal=<id>]',
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
	syncCommand,
	taskQueueCommand,
	delegateCommand,
	planCommand,
];
