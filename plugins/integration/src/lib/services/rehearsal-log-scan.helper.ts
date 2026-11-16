/**
 * rehearsal-log-scan.helper.ts — the secret scan of a scenario's logs. It
 * starts only when every workflow run of the scenario has concluded, which
 * it learns from the forge; it waits for that no longer than the scan wait cap.
 * A run that started and has not concluded by then is not measured, with its
 * id: never a hit and never a pass. A run queued with no job was never
 * enqueued by the forge: it has no log, so it is listed as unstarted instead.
 */
import {
	REHEARSAL_SCAN_WAIT_CAP_SECONDS,
	REHEARSAL_POLL_MS,
	REHEARSAL_RUNNING_STATUSES,
} from '../contracts/constants/rehearsal.constant';
import type {
	ILogScan,
	IUnstartedRun,
} from '../contracts/interfaces/rehearsal-evidence.interface';
import type {
	IRehearsalClock,
	IRehearsalEvidence,
	IRehearsalForge,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';

import { secretHitsIn } from './rehearsal-cleanup.service';
import { unstartedOf } from './rehearsal-unstarted.helper';

interface IScanPorts {
	readonly forge: Pick<IRehearsalForge, 'runs' | 'runLog' | 'jobCount'>;
	readonly clock: IRehearsalClock;
}

/**
 * Every run counts here, not the newest per workflow and commit: the scan
 * reads each run's log, so it waits for exactly the runs it will read (an
 * older land run still queued behind a newer one has no log yet).
 */
const isOpen = (run: IRehearsalRun): boolean =>
	REHEARSAL_RUNNING_STATUSES.has(run.status);

const headsOf = (one: IRehearsalEvidence): ReadonlySet<string> =>
	new Set([
		one.integration,
		...Object.values(one.pulls).map((pull) => pull.head),
		...one.runs.map((run) => run.headBranch),
	]);

const runsOf = async (
	ports: IScanPorts,
	one: IRehearsalEvidence,
): Promise<ReadonlyMap<number, IRehearsalRun>> => {
	const latest = new Map(one.runs.map((run) => [run.id, run] as const));
	for (const head of headsOf(one))
		for (const run of await ports.forge.runs(head)) latest.set(run.id, run);
	return latest;
};

/** The scenario's runs once none is queued or in progress, or as they stand at the cap. */
const concluded = async (
	ports: IScanPorts,
	one: IRehearsalEvidence,
): Promise<ReadonlyMap<number, IRehearsalRun>> => {
	const started = ports.clock.now();
	for (;;) {
		const runs = await runsOf(ports, one);
		const open = [...runs.values()].some(isOpen);
		if (
			!open ||
			ports.clock.now() - started >=
				REHEARSAL_SCAN_WAIT_CAP_SECONDS * 1000
		)
			return runs;
		await ports.clock.wait(REHEARSAL_POLL_MS);
	}
};

const scanScenario = async (
	ports: IScanPorts,
	one: IRehearsalEvidence,
): Promise<ILogScan> => {
	const hits: string[] = [];
	const unread: string[] = [];
	const unstarted: IUnstartedRun[] = [];
	const runs = [...(await concluded(ports, one)).values()];
	for (const run of runs) {
		if (isOpen(run)) {
			// Queued at the cap with no job: the forge never enqueued it, so there is no log to read.
			if (
				run.status === 'queued' &&
				(await ports.forge.jobCount(run.id)) === 0
			) {
				unstarted.push(unstartedOf(run, runs));
				continue;
			}
			unread.push(
				`${run.workflow} run ${String(run.id)}: not concluded within the ${String(REHEARSAL_SCAN_WAIT_CAP_SECONDS)} s cap`,
			);
			continue;
		}
		try {
			hits.push(...secretHitsIn(run, await ports.forge.runLog(run.id)));
		} catch (error) {
			unread.push(
				`${run.workflow} run ${String(run.id)}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return { hits, unread, unstarted };
};

/** Token shapes in the logs of every scenario's runs, each scenario scanned after its runs concluded. */
export const scanLogs = async (
	ports: IScanPorts,
	evidence: readonly IRehearsalEvidence[],
): Promise<ILogScan> => {
	try {
		const scans = await Promise.all(
			evidence.map((one) => scanScenario(ports, one)),
		);
		return {
			hits: scans.flatMap((scan) => scan.hits),
			unread: scans.flatMap((scan) => scan.unread),
			unstarted: scans.flatMap((scan) => scan.unstarted),
		};
	} catch (error) {
		return {
			hits: [],
			unstarted: [],
			unread: [
				`log scan failed: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};
