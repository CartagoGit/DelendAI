/**
 * rehearsal.service.ts — one run of the rehearsal: sweep what an earlier
 * run left, play each scenario on its own branch, read every log the run
 * started for secrets, clean up, and judge. Nothing here writes to the
 * integration or release branch: the base is read for its tip (or is the
 * commit the code runs at) and every
 * write goes under the run's namespace.
 */
import type {
	IRehearsalEvidence,
	IRehearsalMode,
	IRehearsalReport,
	IRehearsalScenario,
	IRehearseInput,
} from '../contracts/interfaces/rehearsal.interface';
import type {
	ILogScan,
	IUnstartedRun,
} from '../contracts/interfaces/rehearsal-evidence.interface';

import {
	cleanRun,
	newRunId,
	sweepStaleRuns,
} from './rehearsal-cleanup.service';
import { REHEARSAL_GROUPING } from '../contracts/constants/rehearsal.constant';
import { scanLogs } from './rehearsal-log-scan.helper';
import { playPooled } from './rehearsal-pool.helper';
import { buildReport } from './rehearsal-report.service';
import { runBranchRoot } from './rehearsal-names.helper';
import { runScenario } from './rehearsal-run.service';
import { mergeUnstarted } from './rehearsal-unstarted.helper';

/** The scenarios `ids` name, in the catalogue's order; an unknown id is refused. */
export const selectScenarios = <T extends { readonly id: string }>(
	catalogue: readonly T[],
	ids: readonly string[],
	all = 'all',
): readonly T[] => {
	if (ids.length === 1 && ids[0] === all) return catalogue;
	const unknown = ids.filter((id) => !catalogue.some((one) => one.id === id));
	if (unknown.length > 0)
		throw new Error(
			`unknown scenario(s) ${unknown.join(', ')}; known: ${catalogue.map((one) => one.id).join(', ') || 'none'}`,
		);
	return catalogue.filter((one) => ids.includes(one.id));
};

/** Whether `scenario` runs in `mode`; one that names no modes runs in both. */
export const runsInMode = (
	scenario: Pick<IRehearsalScenario, 'modes'>,
	mode: IRehearsalMode,
): boolean => scenario.modes === undefined || scenario.modes.includes(mode);

/** The scenarios of `catalogue` that run in `mode`, in its order. */
export const scenariosForMode = <T extends Pick<IRehearsalScenario, 'modes'>>(
	catalogue: readonly T[],
	mode: IRehearsalMode,
): readonly T[] => catalogue.filter((one) => runsInMode(one, mode));

const iso = (ms: number): string => new Date(ms).toISOString();

/** One scenario's evidence; an exception while playing or reading it is the scenario's result, never the run's end. */
const playOne = async (
	context: Parameters<typeof runScenario>[0],
	scenario: IRehearsalScenario,
	now: () => number,
): Promise<IRehearsalEvidence> => {
	try {
		return await runScenario(context, scenario);
	} catch (error) {
		const at = iso(now());
		return {
			scenario: scenario.id,
			integration: '',
			pulls: {},
			events: {},
			runs: [],
			tips: [],
			manualSteps: [],
			tokenHeads: {},
			tokenPulls: {},
			startedAt: at,
			finishedAt: at,
			failures: [
				`error: ${error instanceof Error ? error.message : String(error)}`,
			],
		};
	}
};

/** Runs the rehearsal and returns its report; cleanup runs even when a scenario stops. */
export const rehearse = async (
	input: IRehearseInput,
): Promise<IRehearsalReport> => {
	const startedMs = input.clock.now();
	const runId = newRunId(startedMs, input.group);
	for (const swept of await sweepStaleRuns({
		forge: input.forge,
		clock: input.clock,
		branchPrefix: input.branchPrefix,
		now: startedMs,
	}))
		input.log(`swept the leftovers of ${swept}`);
	const tip = input.baseCommit ?? (await input.forge.tipOf(input.baseBranch));
	const context = {
		forge: input.forge,
		clock: input.clock,
		setup: input.setup(runId),
		runId,
		tip,
		branchPrefix: input.branchPrefix,
		log: input.log,
		awaitCapSeconds:
			REHEARSAL_GROUPING[input.mode ?? 'fast'].awaitCapSeconds,
		awaitBudgetSeconds:
			REHEARSAL_GROUPING[input.mode ?? 'fast'].awaitBudgetSeconds,
		mode: input.mode ?? 'fast',
	};
	const evidence: IRehearsalEvidence[] = [];
	let scan: ILogScan = { hits: [], unread: [], unstarted: [] };
	let leftovers: readonly string[] = [];
	let unstartedByCleanup: readonly IUnstartedRun[] = [];
	try {
		// Scenarios share nothing but the read-only context, so they play at once; the evidence keeps the catalogue's order.
		evidence.push(
			...(await playPooled(
				input.scenarios,
				input.concurrency ?? input.scenarios.length,
				async (scenario) => {
					const played = await playOne(
						context,
						scenario,
						input.clock.now,
					);
					// A step that could not be taken is said at once, not only in the report.
					for (const failure of played.failures)
						input.log(`${scenario.id}: ${failure}`);
					return played;
				},
			)),
		);
		scan = await scanLogs(
			{
				forge: input.forge,
				clock: input.clock,
				branchRoot: runBranchRoot(input.branchPrefix, runId),
			},
			evidence,
		);
	} finally {
		// A cleanup that fails is a leftover, said in the report: it never ends the run without one.
		const cleaned = await cleanRun({
			forge: input.forge,
			clock: input.clock,
			branchPrefix: input.branchPrefix,
			runId,
		}).catch((error: unknown) => ({
			leftovers: [
				`cleanup failed: ${error instanceof Error ? error.message : String(error)}`,
			],
			unstarted: [],
		}));
		leftovers = cleaned.leftovers;
		unstartedByCleanup = cleaned.unstarted;
	}
	input.log(
		`run ${runId} cleaned under ${runBranchRoot(input.branchPrefix, runId)}`,
	);
	return buildReport({
		runId,
		repository: input.repository,
		tip,
		startedAt: iso(startedMs),
		finishedAt: iso(input.clock.now()),
		scenarios: input.scenarios,
		...(input.mode === undefined ? {} : { mode: input.mode }),
		evidence,
		leftovers,
		secretHits: scan.hits,
		unreadLogs: scan.unread,
		unstarted: mergeUnstarted(scan.unstarted, unstartedByCleanup),
	});
};
