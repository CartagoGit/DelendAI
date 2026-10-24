import type { INewWorkEvent, IWorkItemId } from '../../../events/work-event';

export type IGitTrigger = 'write' | 'commit';

export interface IGitEventSink {
	append(event: INewWorkEvent): Promise<unknown>;
}

export interface IGitObserverOptions {
	/** Directory git runs in; each observer only ever sees its own. */
	readonly cwd: string;
	readonly workItemId: IWorkItemId;
	readonly actorId: string | null;
	readonly sink: IGitEventSink;
	readonly timeoutMs?: number;
	/** Git executable; overridable so tests can simulate a slow git. */
	readonly gitBinary?: string;
	readonly now?: () => number;
}

export interface IGitObservation {
	readonly trigger: IGitTrigger;
	readonly branch: string;
	readonly paths: readonly string[];
	readonly diffStat: string;
}
