/**
 * rehearsal.service.ts — one run of the rehearsal: sweep what an earlier
 * run left, play each scenario on its own branch, read every log the run
 * started for secrets, clean up, and judge. Nothing here writes to the
 * integration or release branch: the base is read for its tip and every
 * write goes under the run's namespace.
 */
import type {
	IRehearsalEvidence,
	IRehearsalReport,
	IRehearseInput,
} from '../contracts/interfaces/rehearsal.interface';

import {
	cleanRun,
	newRunId,
	secretHitsIn,
	sweepStaleRuns,
} from './rehearsal-cleanup.service';
import { buildReport } from './rehearsal-report.service';
import { runBranchRoot } from './rehearsal-names.helper';
import { runScenario } from './rehearsal-run.service';

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

const iso = (ms: number): string => new Date(ms).toISOString();

const logHits = async (
	input: IRehearseInput,
	evidence: readonly IRehearsalEvidence[],
): Promise<readonly string[]> => {
	const seen = new Set<number>();
	const hits: string[] = [];
	for (const one of evidence)
		for (const run of one.runs) {
			if (seen.has(run.id)) continue;
			seen.add(run.id);
			hits.push(...secretHitsIn(run, await input.forge.runLog(run.id)));
		}
	return hits;
};

/** Runs the rehearsal and returns its report; cleanup runs even when a scenario stops. */
export const rehearse = async (
	input: IRehearseInput,
): Promise<IRehearsalReport> => {
	const startedMs = input.clock.now();
	const runId = newRunId(startedMs);
	for (const swept of await sweepStaleRuns({
		forge: input.forge,
		branchPrefix: input.branchPrefix,
		now: startedMs,
	}))
		input.log(`swept the leftovers of ${swept}`);
	const tip = await input.forge.tipOf(input.baseBranch);
	const context = {
		forge: input.forge,
		clock: input.clock,
		setup: input.setup(runId),
		runId,
		tip,
		branchPrefix: input.branchPrefix,
		log: input.log,
	};
	const evidence: IRehearsalEvidence[] = [];
	let secretHits: readonly string[] = [];
	let leftovers: readonly string[] = [];
	try {
		for (const scenario of input.scenarios)
			evidence.push(await runScenario(context, scenario));
		secretHits = await logHits(input, evidence);
	} finally {
		leftovers = await cleanRun({
			forge: input.forge,
			branchPrefix: input.branchPrefix,
			runId,
		});
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
		evidence,
		leftovers,
		secretHits,
	});
};
