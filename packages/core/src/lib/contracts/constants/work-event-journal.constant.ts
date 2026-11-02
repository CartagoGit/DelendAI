/**
 * Where work events are journalled, relative to the shared checkout. The
 * private telemetry package reads this file; published code only appends.
 */
export const WORK_EVENT_JOURNAL_PATH =
	'.cache/delendai/telemetry/work-event-journal.ndjson';
