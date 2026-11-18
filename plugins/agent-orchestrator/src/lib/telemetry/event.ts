/**
 * Lightweight in-process telemetry sink for the policy engine.
 *
 * Every `plan()` call and every `classify()` call emits a structured
 * event. Hosts wire their own sink via the `IOrchestratorEngineOptions.telemetry`
 * option (typed below). The default sink is an in-memory ring buffer
 * the `<ns>_events` tool reads. Test code injects a custom sink to
 * assert on the event stream.
 */
import type { IModePlan, ITask, OrchestrationMode } from '../policy/types.js';
import type { IClassificationVerdict } from '../classifier/task-classifier.js';

/** Canonical event kinds. */
export type TelemetryEventKind =
	| 'plan'
	| 'classify'
	| 'dispatch.start'
	| 'dispatch.end'
	| 'rotate';

export interface ITelemetryEvent {
	readonly ts: number;
	readonly kind: TelemetryEventKind;
	readonly taskId: string;
	/** When applicable, the inner mode picked by the classifier. */
	readonly innerMode?: OrchestrationMode;
	/** Classifier confidence (0..1). */
	readonly confidence?: number;
	/** Free-form evidence (mode rationale, rotation reason, etc.). */
	readonly evidence?: string;
	/** Token spend for the event (dispatch.end). */
	readonly tokensUsed?: number;
}

export interface ITelemetrySink {
	emit(event: ITelemetryEvent): void;
	/** Snapshot of recent events. Hosts may evict. */
	read(): readonly ITelemetryEvent[];
	/** Clear the buffer. */
	reset(): void;
}

export class InMemoryTelemetrySink implements ITelemetrySink {
	readonly #capacity: number;
	readonly #events: ITelemetryEvent[] = [];

	constructor(capacity = 256) {
		this.#capacity = capacity;
	}

	emit(event: ITelemetryEvent): void {
		this.#events.push(event);
		while (this.#events.length > this.#capacity) {
			this.#events.shift();
		}
	}

	read(): readonly ITelemetryEvent[] {
		return [...this.#events];
	}

	reset(): void {
		this.#events.length = 0;
	}
}

/** Helper builders so callers don't construct events inline. */
export const TelemetryEvent = {
	plan(
		task: ITask,
		plan: IModePlan,
		verdict?: IClassificationVerdict,
	): ITelemetryEvent {
		return {
			ts: Date.now(),
			kind: 'plan',
			taskId: task.id,
			...(plan.mode !== 'auto' && verdict !== undefined
				? { innerMode: plan.mode, confidence: verdict.confidence }
				: {}),
			evidence: plan.rationale,
		};
	},
	classify(task: ITask, verdict: IClassificationVerdict): ITelemetryEvent {
		return {
			ts: Date.now(),
			kind: 'classify',
			taskId: task.id,
			innerMode: verdict.mode,
			confidence: verdict.confidence,
			evidence: verdict.reason,
		};
	},
	dispatchStart(taskId: string): ITelemetryEvent {
		return { ts: Date.now(), kind: 'dispatch.start', taskId };
	},
	dispatchEnd(
		taskId: string,
		ok: boolean,
		tokensUsed: number,
	): ITelemetryEvent {
		return {
			ts: Date.now(),
			kind: 'dispatch.end',
			taskId,
			tokensUsed,
			evidence: ok ? 'ok' : 'failed',
		};
	},
	rotate(
		taskId: string,
		subagentId: string,
		reason: string,
	): ITelemetryEvent {
		return {
			ts: Date.now(),
			kind: 'rotate',
			taskId,
			evidence: `${subagentId}: ${reason}`,
		};
	},
};
