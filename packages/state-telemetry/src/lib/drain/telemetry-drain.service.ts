/**
 * telemetry-drain.service.ts — q00020.
 *
 * Published code only appends journal lines under the cache directory.
 * This is the one place that reads them back: work events into the event
 * bus, measured transitions into the duration history the ETA engine
 * reads. It runs on demand; nothing here keeps a process alive.
 */

import { join } from 'node:path';

import { drainTransitionDurationJournal } from '../eta/duration-journal.service';
import { drainWorkEventJournal } from '../events/work-event-journal-drain.service';
import {
	TELEMETRY_DIRECTORY,
	TRANSITION_DURATION_JOURNAL_FILE,
	WORK_EVENT_JOURNAL_FILE,
} from './contracts/constants/telemetry-journal.constant';
import type {
	ITelemetryDrainInput,
	ITelemetryDrainResult,
} from './contracts/interfaces/telemetry-drain.interface';

export const drainTelemetryJournals = async (
	input: ITelemetryDrainInput,
): Promise<ITelemetryDrainResult> => {
	const directory = join(input.root, TELEMETRY_DIRECTORY);
	const workEvents = await drainWorkEventJournal(
		input.events,
		join(directory, WORK_EVENT_JOURNAL_FILE),
	);
	const durations = await drainTransitionDurationJournal(
		input.history,
		join(directory, TRANSITION_DURATION_JOURNAL_FILE),
	);
	return { workEvents, durations };
};
