import type { IProducerInputSpec } from '@delendai/state';

import type { IWorkProgressFold } from '../interfaces/work-progress.interface';

/** Phases a work item moves through, in forward order. `done` is the last rank. */
export const WORK_PHASE_ORDER = [
	'investigating',
	'designing',
	'implementing',
	'testing',
	'fixing',
	'validating',
	'reviewing',
	'reconciling',
	'done',
] as const;

/** The closed phase set: the ordered phases plus the out-of-band `blocked`. */
export const WORK_PHASES = [...WORK_PHASE_ORDER, 'blocked'] as const;

/** Identifier the producer registers under in the State Engine. */
export const WORK_PROGRESS_PRODUCER_ID = 'work-progress';

/** Version of the projection shape; bump when a row gains or loses a field. */
export const WORK_PROGRESS_PRODUCER_VERSION = 1;

/** Locators of the three inputs the producer declares. */
export const WORK_PROGRESS_INPUT_EVENTS = 'work_events';
export const WORK_PROGRESS_INPUT_ITEMS = 'work_items';
export const WORK_PROGRESS_INPUT_ASSIGNMENTS = 'work_assignments';

/** Repeats of one failure hash at which an item counts as stalled. */
export const STALLED_FAILURE_THRESHOLD_DEFAULT = 3;

/** Event kinds that carry a failure hash in their payload hash. */
export const FAILURE_EVENT_KINDS: readonly string[] = ['tool_error'];

/** Event kinds that start a new attempt, so a failure run ends. */
export const ATTEMPT_EVENT_KINDS: readonly string[] = ['git_change'];

/** How many of the latest events the confidence variance looks at. */
export const CONFIDENCE_WINDOW = 10;

/** Confidence cap when no acceptance criterion is checked off. */
export const CONFIDENCE_CAP_FLOOR = 0.5;

/** Confidence cap when every acceptance criterion is checked off. */
export const CONFIDENCE_CAP_CEILING = 1;

/** Weight of a slice with no acceptance criteria, and the log2 base offset. */
export const WEIGHT_BASE = 1;

/** Accepted range for an explicit weight override. */
export const WEIGHT_OVERRIDE_MIN = 0.1;
export const WEIGHT_OVERRIDE_MAX = 100;

/** Progress is reported on a 0..100 scale. */
export const PROGRESS_FULL = 100;

/** Minimum gap between two deliveries for the same work item. */
export const SUBSCRIBE_COALESCE_INTERVAL_MS = 1000;

/** Change kind `reconcile` understands: events appended after the base. */
export const EVENTS_APPENDED_CHANGE = 'events-appended';

/** The fold of a work item that has seen no event yet. */
export const EMPTY_FOLD: IWorkProgressFold = {
	phaseRank: 0,
	recentRanks: [],
	lastKind: null,
	lastFailureHash: null,
	failureRun: 0,
	eventCount: 0,
	lastEventAt: 0,
};

/** STATIC input specs: no tables back them yet, the host supplies opaque JSON blobs. */
export const WORK_PROGRESS_INPUTS: readonly IProducerInputSpec[] = [
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_EVENTS },
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_ITEMS },
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_ASSIGNMENTS },
];
