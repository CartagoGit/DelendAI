/**
 * integration-rehearsal-groups.command.ts — the three things `integration
 * rehearse` does about the groups a mode's catalogue is cut into: `--plan`
 * prints them for the workflow matrix, `--group=<n>/<total>` picks the one
 * to play, `--merge` joins the groups' reports into the mode's report.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import {
	REHEARSAL_GROUPING,
	REHEARSAL_GROUP_REPORTS_DIR,
	mergeGroupReports,
	partitionScenarios,
	parseGroupSpec,
	renderReportTable,
	rehearsalGroupReportPath,
	rehearsalReportPath,
	selectGroup,
	type IGroupReport,
	type IRehearsalMode,
	type IRehearsalReport,
	type IRehearsalScenario,
} from '@delendai/integration/public';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { IGroupChoice } from '../contracts/interfaces/integration-group-choice.interface';
import type { ICliCommandResult } from '../contracts/interfaces/cli-command.interface';

export const chooseGroup = (
	spec: string | undefined,
	mode: IRehearsalMode,
	selected: readonly IRehearsalScenario[],
	usageLine: string,
): IGroupChoice => {
	if (spec === undefined) return { scenarios: selected };
	const parsed = parseGroupSpec(spec);
	if (parsed === undefined)
		return {
			refusal: {
				code: EXIT_CODE.USAGE,
				error: `usage: ${usageLine} (--group is <n>/<total>)`,
			},
		};
	const group = selectGroup(selected, REHEARSAL_GROUPING[mode].size, parsed);
	return 'error' in group
		? { refusal: { code: EXIT_CODE.USAGE, error: group.error } }
		: { scenarios: group.scenarios, n: parsed.n };
};

/** `--plan`: the matrix the workflow plays, one line per output. */
export const planGroups = (
	mode: IRehearsalMode,
	selected: readonly IRehearsalScenario[],
): ICliCommandResult => {
	const grouping = REHEARSAL_GROUPING[mode];
	const total = partitionScenarios(selected, grouping.size).length;
	const numbers = Array.from({ length: total }, (_, index) => index + 1);
	const parallel =
		grouping.maxParallel === 'all'
			? Math.max(1, total)
			: grouping.maxParallel;
	return {
		code: EXIT_CODE.OK,
		text: [
			`matrix=${JSON.stringify({ group: numbers })}`,
			`total=${String(total)}`,
			`parallel=${String(parallel)}`,
		].join('\n'),
	};
};

const readGroupReport = async (
	cwd: string,
	mode: IRehearsalMode,
	n: number,
): Promise<IGroupReport> => {
	const file = join(
		cwd,
		REHEARSAL_GROUP_REPORTS_DIR,
		rehearsalGroupReportPath(mode, n).split('/').at(-1) ?? '',
	);
	try {
		return {
			report: JSON.parse(
				await readFile(file, 'utf8'),
			) as IRehearsalReport,
		};
	} catch (error) {
		return {
			missing: `${file}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};

/** `--merge`: the groups' reports into the mode's report, written where activation reads it. */
export const mergeGroups = async (
	cwd: string,
	mode: IRehearsalMode,
	selected: readonly IRehearsalScenario[],
): Promise<ICliCommandResult> => {
	const parts = partitionScenarios(selected, REHEARSAL_GROUPING[mode].size);
	const groups = parts.map((scenarios, index) => ({
		n: index + 1,
		total: parts.length,
		scenarios,
	}));
	const report = mergeGroupReports({
		mode,
		groups,
		reports: await Promise.all(
			groups.map((group) => readGroupReport(cwd, mode, group.n)),
		),
	});
	const reportFile = join(cwd, rehearsalReportPath(mode));
	await mkdir(dirname(reportFile), { recursive: true });
	await writeFile(reportFile, JSON.stringify(report, null, '\t'));
	return {
		code: report.ok ? EXIT_CODE.OK : EXIT_CODE.RUNTIME,
		data: report,
		text: renderReportTable(report),
	};
};
