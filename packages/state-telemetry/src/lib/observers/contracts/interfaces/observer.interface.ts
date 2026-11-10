import type { INewWorkEvent, IWorkItemId } from '../../../events/work-event';
import type { IGitEventSink } from './git-observer.interface';

export type IObserverEventSink = IGitEventSink;

/** Options every pure observer shares. */
export interface IObserverOptions {
	readonly workItemId: IWorkItemId;
	readonly actorId: string | null;
	readonly sink: IObserverEventSink;
	readonly now?: () => number;
}

export type IObserverEvent = INewWorkEvent;

export interface IFailureNormalizeOptions {
	/** Absolute prefix turned into a relative path; defaults to the process cwd. */
	readonly rootDir?: string | undefined;
}

export interface ITestRun {
	readonly id: string;
	readonly command: string;
}

export interface ITestFailure {
	readonly path: string;
	readonly message: string;
}

export interface ITestResult {
	readonly passed: number;
	readonly failed: number;
	readonly firstFailure?: ITestFailure;
}

export interface IToolFinish {
	readonly durationMs: number;
}

export interface IToolFailure {
	readonly exitCode: number;
	readonly message: string;
}

export interface ILeaseRef {
	readonly id: string;
	readonly workItemId: IWorkItemId;
	readonly agentId: string;
}

export interface IAgentLeaseObserverOptions {
	readonly sink: IObserverEventSink;
	readonly heartbeatIntervalMs?: number;
	readonly now?: () => number;
}
