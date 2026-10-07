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
