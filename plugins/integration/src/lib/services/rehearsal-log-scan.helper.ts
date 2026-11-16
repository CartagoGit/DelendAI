/**
 * rehearsal-log-scan.helper.ts — the secret scan of a scenario's logs. It
 * starts only when every workflow run of the scenario has concluded, which
 * it learns from the forge; it waits for that no longer than the await cap.
 * A run that has not concluded by then is not measured, with its id: never
 * a hit and never a pass.
 */
import {
	REHEARSAL_AWAIT_CAP_SECONDS,
	REHEARSAL_POLL_MS,
} from '../contracts/constants/rehearsal.constant';
import type { ILogScan } from '../contracts/interfaces/rehearsal-evidence.interface';
import type {
	IRehearsalClock,
	IRehearsalEvidence,
	IRehearsalForge,
	IRehearsalRun,
} from '../contracts/interfaces/rehearsal.interface';

import { secretHitsIn } from './rehearsal-cleanup.service';
import { openRuns } from './rehearsal-wait.helper';

interface IScanPorts {
	readonly forge: Pick<IRehearsalForge, 'runs' | 'runLog'>;
	readonly clock: IRehearsalClock;
}

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
		const open = openRuns([...runs.values()]).length > 0;
		if (
			!open ||
			ports.clock.now() - started >= REHEARSAL_AWAIT_CAP_SECONDS * 1000
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
	const runs = [...(await concluded(ports, one)).values()];
	const open = new Set(openRuns(runs).map((run) => run.id));
	for (const run of runs) {
		if (open.has(run.id)) {
			unread.push(
				`${run.workflow} run ${String(run.id)}: not concluded within the ${String(REHEARSAL_AWAIT_CAP_SECONDS)} s cap`,
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
	return { hits, unread };
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
		};
	} catch (error) {
		return {
			hits: [],
			unread: [
				`log scan failed: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};
