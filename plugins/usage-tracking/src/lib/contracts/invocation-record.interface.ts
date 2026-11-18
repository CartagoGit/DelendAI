import type { IDelegationRecord } from '@delendai/contracts';
import type {
	IAgentDescriptor,
	IInvocationOutcome,
	IInvocationRecord,
	IModelDescriptor,
	IUsageTokens,
} from '../types';

export type InvocationRequestType =
	| 'query'
	| 'mutation'
	| 'execution'
	| 'invocation'
	| 'tool-call'
	| 'unknown';

export type InvocationErrorClassification =
	| 'timeout'
	| 'schema-incongruence'
	| 'validation'
	| 'privacy'
	| 'network'
	| 'auth'
	| 'tool-error'
	| 'unknown';

/**
 * Whether the task the call served was done right. Set from a gate result
 * (see `taskOutcomeFromGate`), never reported by the worker itself.
 */
export type ITaskOutcome = 'correct' | 'blocked' | 'failed';

/** What a gate said about the task: the only source of a task outcome. */
export type IGateResult = 'pass' | 'fail' | 'blocked';

export interface IInvocationCorrelation {
	readonly id: string;
	readonly source: 'args' | 'result' | 'error' | 'derived';
}

export interface IInvocationErrorTelemetry {
	readonly code: string;
	readonly classification: InvocationErrorClassification;
	readonly message: string;
	readonly correlationId: string | null;
	readonly incongruence: boolean;
	readonly redacted: boolean;
}

export interface IInvocationDimensions {
	readonly plugin: string;
	readonly tool: string;
	readonly model: string | null;
	readonly agent: string;
	readonly requestType: InvocationRequestType;
	readonly outcome: IInvocationOutcome;
	readonly error: InvocationErrorClassification | null;
	readonly correlation: string | null;
	readonly iteration: number | null;
	readonly latencyMs: number | null;
	readonly tokenCount: number | null;
}

export interface IInvocationRecordTelemetry extends IInvocationRecord {
	readonly host?: string;
	/** The delegated steps a dispatch reported, as it measured them. */
	readonly delegations?: readonly IDelegationRecord[];
	readonly model: IModelDescriptor | null;
	readonly usage: IUsageTokens | null;
	readonly agent: IAgentDescriptor;
	readonly requestType?: InvocationRequestType;
	readonly iteration?: number | null;
	readonly retry?: boolean;
	readonly correlation?: IInvocationCorrelation | null;
	readonly latencyMs?: number | null;
	readonly tokenCount?: number | null;
	readonly successful?: boolean;
	readonly failure?: boolean;
	readonly errorTelemetry?: IInvocationErrorTelemetry | null;
	readonly dimensions?: IInvocationDimensions;
	/** The model the call asked for; differs from `model` when the host swapped it. */
	readonly requestedModel?: string | null;
	/** Conversation turns the call took. */
	readonly turns?: number;
	/** How many times the call was retried. */
	readonly retries?: number;
	/** The class of task the call served (for example `coding`). */
	readonly taskClass?: string;
	readonly taskOutcome?: ITaskOutcome;
}

export interface IBuildInvocationRecordInput {
	readonly toolName: string;
	readonly corePrefix: string;
	readonly peerPrefixes: readonly string[];
	readonly agent: IAgentDescriptor;
	readonly host?: string | undefined;
	readonly sessionId: string;
	readonly args: unknown;
	readonly result: unknown;
	readonly error?: unknown;
	readonly startedAt?: number | undefined;
	readonly endedAt: number;
	readonly responseBytes?: number | undefined;
	readonly fallbackModel?: IModelDescriptor | null | undefined;
	/** Optional baseline token resolver, keyed by attributed plugin/tool. */
	readonly baselineTokensOf?:
		| ((plugin: string, tool: string) => number | undefined)
		| undefined;
	readonly costOf: (
		model: IModelDescriptor | null,
		usage: IUsageTokens | null,
	) => number | null;
}
