/**
 * @delendai/state-telemetry/public — the read API of the progress projector.
 */
export type {
	IPhaseRule,
	IWorkItemInput,
	IWorkProgressOptions,
	IWorkProgressService,
	IWorkProgressServiceOptions,
	IWorkProgressSnapshot,
	ISnapshotListener,
	IWorkPhase,
} from '../lib/projector/contracts/interfaces/work-progress.interface';
export {
	WORK_PHASES,
	WORK_PHASE_ORDER,
	WORK_PROGRESS_PRODUCER_ID,
} from '../lib/projector/contracts/constants/work-progress.constant';
export { resolvePhaseRules } from '../lib/projector/phase-rules.service';
export { aggregateProgress } from '../lib/projector/progress-weighting.service';
export { createWorkProgressProducer } from '../lib/projector/work-progress-producer.service';
export { createWorkProgressService } from '../lib/projector/work-progress-api.service';
export { drainWorkEventJournal } from '../lib/events/work-event-journal-drain.service';
export { WorkEventStoreFacade } from '../lib/events/work-event-store.facade';
export type {
	IWorkEventDrainResult,
	IWorkEventSink,
} from '../lib/events/contracts/interfaces/work-event-journal-drain.interface';
export { drainTelemetryJournals } from '../lib/drain/telemetry-drain.service';
export type {
	ITelemetryDrainInput,
	ITelemetryDrainResult,
} from '../lib/drain/contracts/interfaces/telemetry-drain.interface';
export { DurationHistoryFacade } from '../lib/eta/duration-history';
export {
	activeAgents,
	buildWorkStatus,
	renderWorkStatus,
	workItemsOf,
} from '../lib/status/work-status.service';
export { WATCH_INTERVAL_MS } from '../lib/status/contracts/constants/work-status.constant';
export type {
	IWorkAgentRow,
	IWorkStatusInput,
	IWorkStatusProposal,
	IWorkStatusRow,
} from '../lib/status/contracts/interfaces/work-status.interface';
