/**
 * rehearsal-merge.service.ts — the reports of the groups of one mode merged
 * into the one report activation reads. Pure: the targets are recomputed from
 * the groups' samples over all their scenarios, and a group whose report is
 * missing, unreadable or for another commit is a named failure, never a
 * silent pass.
 */
import type {
	IGroupPlan,
	IGroupReport,
} from '../contracts/interfaces/rehearsal-groups.interface';
import type {
	IRehearsalMode,
	IRehearsalReport,
	IRehearsalSamples,
	IRehearsalScenario,
	IRehearsalScenarioResult,
} from '../contracts/interfaces/rehearsal.interface';

import { result } from './rehearsal-expectation.service';
import {
	sumSamples,
	targetClears,
	targetsOfSamples,
} from './rehearsal-targets.service';

const EPOCH = '1970-01-01T00:00:00.000Z';

const label = (group: IGroupPlan): string =>
	`group ${String(group.n)}/${String(group.total)}`;

/** Why a group's report cannot count, or `undefined` when it can. */
const problemOf = (
	group: IGroupPlan,
	mode: IRehearsalMode,
	tip: string | undefined,
	found: IGroupReport,
): string | undefined => {
	if ('missing' in found)
		return `${label(group)} report is missing: ${found.missing}`;
	const { report } = found;
	if (report.mode !== mode)
		return `${label(group)} report is for mode ${report.mode}, not ${mode}`;
	if (report.samples === undefined)
		return `${label(group)} report carries no samples to merge`;
	if (tip !== undefined && report.tip !== tip)
		return `${label(group)} report is for ${report.tip}, not for ${tip}`;
	return undefined;
};

const redScenario = (
	scenario: IRehearsalScenario,
	detail: string,
): IRehearsalScenarioResult => ({
	id: scenario.id,
	title: scenario.title,
	...(scenario.reproduces === undefined
		? {}
		: { reproduces: scenario.reproduces }),
	ok: false,
	expectations: [result('ran', false, detail)],
	integration: '',
	pulls: {},
});

/** The scenarios of a group that counts: each as its report judged it, a planned one it lacks as red. */
const resultsOf = (
	group: IGroupPlan,
	report: IRehearsalReport,
): readonly IRehearsalScenarioResult[] =>
	group.scenarios.map(
		(scenario) =>
			report.scenarios.find((one) => one.id === scenario.id) ??
			redScenario(
				scenario,
				`the scenario is not in the ${label(group)} report`,
			),
	);

/** The report of the mode: every group's scenarios, the targets over all of them. */
export const mergeGroupReports = (input: {
	readonly mode: IRehearsalMode;
	readonly groups: readonly IGroupPlan[];
	/** One per group, in the same order. */
	readonly reports: readonly IGroupReport[];
}): IRehearsalReport => {
	const firstTip = input.reports.flatMap((found) =>
		'report' in found && found.report.samples !== undefined
			? [found.report.tip]
			: [],
	)[0];
	const counted: IRehearsalReport[] = [];
	const scenarios: IRehearsalScenarioResult[] = [];
	const problems: string[] = [];
	input.groups.forEach((group, index) => {
		const found = input.reports[index] ?? { missing: 'no report given' };
		const problem = problemOf(group, input.mode, firstTip, found);
		if (problem !== undefined || !('report' in found)) {
			problems.push(problem ?? `${label(group)} report is missing`);
			scenarios.push(
				...group.scenarios.map((scenario) =>
					redScenario(scenario, problem ?? 'no report'),
				),
			);
			return;
		}
		counted.push(found.report);
		scenarios.push(...resultsOf(group, found.report));
	});
	const samples: IRehearsalSamples = sumSamples(
		counted.flatMap((one) =>
			one.samples === undefined ? [] : [one.samples],
		),
	);
	const leftovers = counted.flatMap((one) => one.leftovers);
	const secretHits = counted.flatMap((one) => one.secretHits);
	const unreadLogs = counted.flatMap((one) => one.unreadLogs ?? []);
	const unstartedRuns = counted.flatMap((one) => one.unstartedRuns ?? []);
	const targets = targetsOfSamples(
		samples,
		secretHits.length,
		unreadLogs,
		unstartedRuns,
	);
	return {
		runId:
			counted.length === 0
				? `merged-${input.mode}`
				: counted.map((one) => one.runId).join('+'),
		mode: input.mode,
		repository: counted[0]?.repository ?? '',
		tip: firstTip ?? '',
		startedAt: counted.map((one) => one.startedAt).sort()[0] ?? EPOCH,
		finishedAt:
			counted
				.map((one) => one.finishedAt)
				.sort()
				.at(-1) ?? EPOCH,
		scenarios,
		targets,
		samples,
		leftovers,
		secretHits,
		...(unreadLogs.length === 0 ? {} : { unreadLogs }),
		...(unstartedRuns.length === 0 ? {} : { unstartedRuns }),
		ok:
			problems.length === 0 &&
			scenarios.every((one) => one.ok) &&
			targets.every(targetClears) &&
			secretHits.length === 0,
	};
};
