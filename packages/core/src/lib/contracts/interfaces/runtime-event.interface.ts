/**
 * Type contracts moved out of `lib/observability/runtime-events.ts`.
 *
 * Declared here rather than beside the implementation because
 * `@delendai/core/contracts` re-exports it, and TypeScript type-checks
 * the whole target module to resolve a type — so re-exporting from the
 * implementation dragged its `node:*` imports into every consumer that
 * compiles without `@types/node`, which is the audience the `contracts`
 * subpath exists to serve.
 */
export type RuntimeEventKind =
	| 'session.started'
	| 'tool.started'
	| 'tool.completed'
	| 'tool.failed'
	| 'tool.cancelled'
	| 'plugin.activated';

export type ToolFailureClass =
	| 'input-invalid'
	| 'refused'
	| 'threw'
	| 'cancelled';

/** Why a tool call failed: a bounded class and a stable, redacted code. */
export interface IToolFailure {
	readonly class: ToolFailureClass;
	readonly code: string;
}

/** Stable, host-neutral event envelope written outside MCP stdio. */
export interface IRuntimeEvent {
	readonly version: 1;
	readonly ts: string;
	readonly sessionId: string;
	readonly kind: RuntimeEventKind;
	readonly toolName?: string;
	readonly pluginName?: string;
	readonly toolCount?: number;
	readonly elapsedMs?: number;
	readonly error?: boolean;
	/** Present on `tool.failed` events only. */
	readonly failure?: IToolFailure;
	readonly estimatedTokens4B?: number;
	readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

export type RuntimeEventInput = Omit<IRuntimeEvent, 'sessionId'>;

export interface IRuntimeEventSink {
	emit(event: RuntimeEventInput): Promise<void> | void;
	close?(): Promise<void> | void;
}
