/**
 * invoke/types.ts — the runtime vocabulary of subprocess invocation (S6).
 *
 * These are the runner-local shapes the four per-kind invokers
 * (`cli`/`api`/`mcp-server`/`subscription`) and the {@link InvocationManager}
 * share. Nothing here redefines a core contract — the provider/decision
 * vocabulary stays canonical in `@mcp-vertex/core/public`.
 */
import type { IProviderInvoke, IRoutingDecision } from '@mcp-vertex/core/public';

/** Token accounting for a single invocation, mirrored from the wiki shape. */
export interface IInvokeUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly totalTokens: number;
}

/** The structured payload a successful invocation returns to the caller. */
export interface IInvokeResult {
	readonly text: string;
	readonly structuredContent?: unknown;
	readonly usage?: IInvokeUsage;
	readonly costUsd?: number;
}

/** Per-kind cancellation reason, forwarded to the active invocation. */
export type CancelReason = 'user-cancel' | 'timeout' | 'shutdown';

/**
 * A single in-flight invocation. `cancel` applies the PER-KIND ladder
 * (CRITICAL I8): `mcp-server` → JSON-RPC `$/cancelRequest`; `cli` → SIGTERM
 * then SIGKILL; `api` → `AbortController.abort`; `subscription` →
 * best-effort. It must be idempotent.
 */
export interface IActiveInvocation {
	readonly promise: Promise<IInvokeResult>;
	cancel(reason: CancelReason): void;
}

/** What every per-kind invoker receives to start one invocation. */
export interface IInvokeRequest {
	readonly invocationId: string;
	readonly decision: IRoutingDecision;
	readonly invoke: IProviderInvoke;
	readonly prompt: string;
	/** Forwarded to a `cli` subprocess as `--allowedTools`. */
	readonly toolsAllow?: readonly string[];
	/** When true the caller asked for streaming; S6 still returns the final. */
	readonly stream?: boolean;
}

/**
 * A per-kind invoker. `start` is synchronous (it returns a handle whose
 * `.promise` settles later) so the {@link InvocationManager} can register the
 * handle for cancellation BEFORE awaiting it — otherwise a cancel that races
 * the start could be lost.
 */
export interface IKindInvoker {
	start(request: IInvokeRequest): IActiveInvocation;
}

/** A recorded fallback attempt, surfaced in the `all-providers-failed` error. */
export interface ITriedProvider {
	readonly provider: string;
	readonly failure: string;
	readonly at: string;
}
