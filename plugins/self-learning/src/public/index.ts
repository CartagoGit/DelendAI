/**
 * Public surface of `@delendai/self-learning`.
 *
 * The store and the collector are exported as pure functions so another
 * plugin (S5's lessons, for one) can read what this project has learned
 * without importing `src/index.ts`, which has side effects through
 * `definePlugin`.
 */

export { default } from '../index';

export {
	appendObservations,
	parseObservation,
	queryObservations,
	readObservations,
} from '../lib/store/observation-store.service';

export {
	collectFromTestJournal,
	observationsFromJournalLine,
} from '../lib/collectors/test-journal.service';

export { OBSERVATION_KINDS } from '../lib/contracts/interfaces/observation.interface';
export type {
	IObservation,
	IObservationKind,
	IObservationQuery,
	IObservationStoreOptions,
	IObservationWriteResult,
} from '../lib/contracts/interfaces/observation.interface';

export { buildObservationsToolRegistration } from '../lib/tools/observations.tool';
export { buildLessonsToolRegistration } from '../lib/tools/lessons.tool';

export {
	adviseFor,
	deriveLessons,
} from '../lib/lessons/derive-lessons.helper';
export {
	DEFAULT_MINIMUM_SUPPORT,
	DEFAULT_RECENCY_WINDOW_MS,
	scoreConfidence,
} from '../lib/lessons/confidence.helper';
export type {
	IAdvice,
	IDeriveLessonsOptions,
	ILesson,
	ILessonConfidence,
	ILessonKind,
} from '../lib/contracts/interfaces/lesson.interface';
export type { IObservationsToolOptions } from '../lib/tools/observations.tool';
