/**
 * lock-args.ts — r00042 S3.
 *
 * Moved out of `locks/engine.ts` verbatim: the engine was 1,394 lines
 * against the 600-line ceiling this proposal sets, and it is
 * concurrency-sensitive code with a recorded history of subtle
 * correctness bugs. Declarations were relocated, never rewritten.
 */
import type {
	IAgentLockArgs,
	IAgentLockResponse,
} from '../contracts/interfaces/agent-lock.interface';
import type { ISessionBalance } from './agent-lock-session-store';
import { balanceByWorkspace, knownBalanceFor } from './session-balance';

export const lockResult = (
	payload: Record<string, unknown>,
	opts: {
		isError?: boolean;
		balance?: ISessionBalance;
		workspaceRoot?: string;
	} = {},
): IAgentLockResponse => {
	const blocked = payload.blocked === true;
	const isError = opts.isError === true;
	const ok = !isError && !blocked;
	// Resolve the balance for the CURRENT workspace rather than the
	// module-level singleton — the singleton used to bleed across
	// workspaces when the same MCP server drove two workspaces
	// sequentially (see `balanceByWorkspace` declaration above).
	const balance =
		opts.balance ??
		knownBalanceFor(opts.workspaceRoot ?? lastSessionWorkspaceRoot);
	const body = {
		...payload,
		ok,
		session: {
			claims: balance.claims,
			releases: balance.releases,
			imbalance: balance.imbalance,
		},
	};
	return {
		content: [{ type: 'text', text: JSON.stringify(body) }],
		...(isError ? { isError: true } : {}),
	};
};

export const findOverlap = (a: string[], b: string[]): string[] => {
	const setB = new Set(b);
	return a.filter((path) => setB.has(path));
};

export const validateArgs = (
	args: IAgentLockArgs,
): { ok: true; value: IAgentLockArgs } | { ok: false; error: string } => {
	if (args.action === 'claim') {
		if (!args.task_id || !args.agent) {
			return { ok: false, error: 'claim requires task_id and agent' };
		}
		if (!Array.isArray(args.files) || args.files.length === 0) {
			return {
				ok: false,
				error: 'claim requires a non-empty files[] array',
			};
		}
	}
	if (args.action === 'release' && !args.task_id) {
		return { ok: false, error: 'release requires task_id' };
	}
	if (args.action === 'heartbeat' && (!args.task_id || !args.agent)) {
		return {
			ok: false,
			error: 'heartbeat requires task_id and agent',
		};
	}
	return { ok: true, value: args };
};
