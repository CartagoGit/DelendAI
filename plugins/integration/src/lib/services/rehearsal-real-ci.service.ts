/**
 * rehearsal-real-ci.service.ts — real mode: the project's own CI and scan
 * workflows run on the rehearsal branch, and the wall time of a pull
 * request's CI is judged against the same target in the rehearsal report
 * and in production (`ci:cost`).
 *
 * The workflows are the project's files with only their branch filters
 * rendered for the rehearsal branch, so the rehearsal runs the trigger
 * graph production runs.
 */
import {
	PR_CI_WALL_TARGET_MINUTES,
	REHEARSAL_BRANCH_GATED_JOBS,
} from '../contracts/constants/rehearsal.constant';
import type {
	IPrCiWallVerdict,
	IRehearsalFileChange,
} from '../contracts/interfaces/rehearsal.interface';

import { renderSignalJob } from './integration-adoption.service';

const WORKFLOWS = '.github/workflows';
const JOBS_KEY = /^jobs:\s*$/u;
const JOB_KEY = /^( +)([\w-]+):\s*(?:#.*)?$/u;
const PULL_REQUEST_TRIGGER = /^\s*pull_request:/mu;
const SECONDS_PER_MINUTE = 60;

/** Judge a wall time (seconds) the one way the report and production do. */
export const judgePrCiWall = (
	wallSeconds: number,
	touchesIntegrationCode: boolean,
): IPrCiWallVerdict => {
	const thresholdMinutes = touchesIntegrationCode
		? PR_CI_WALL_TARGET_MINUTES.withRehearsal
		: PR_CI_WALL_TARGET_MINUTES.plain;
	const minutes = wallSeconds / SECONDS_PER_MINUTE;
	return { ok: minutes < thresholdMinutes, minutes, thresholdMinutes };
};

/** One job's seconds between two instants, or `undefined` when a step has no times. */
export const wallSecondsOf = (
	steps: readonly {
		readonly startMs: number;
		readonly endMs: number;
	}[],
): number =>
	steps.length === 0
		? 0
		: Math.round(
				(Math.max(...steps.map((s) => s.endMs)) -
					Math.min(...steps.map((s) => s.startMs))) /
					1000,
			);

const BRANCHES_INLINE = /^(\s*)branches:\s*\[([^\]]*)\]\s*$/u;
const BRANCHES_BLOCK = /^(\s*)branches:\s*$/u;
const BLOCK_ITEM = /^(\s*-\s+)(['"]?)([^'"\s#]+)\2(\s*(?:#.*)?)$/u;
const TOP_KEY = /^\S/u;

/** An unquoted or quoted list entry's value. */
const unquoted = (entry: string): string =>
	entry.trim().replace(/^(['"])(.*)\1$/u, '$2');

const IF_KEY = /^\s+if:/u;
const escaped = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/**
 * `text` with `refs/heads/<projectIntegration>` replaced by the rehearsal
 * branch in the `if:` of the jobs `REHEARSAL_BRANCH_GATED_JOBS` lists, and
 * nowhere else.
 */
const renderGatedJobs = (
	text: string,
	branch: string,
	projectIntegration: string,
): string => {
	const named = new RegExp(
		`refs/heads/${escaped(projectIntegration)}(?![\\w./-])`,
		'gu',
	);
	let jobIndent: number | undefined;
	return text
		.split('\n')
		.map((line) => {
			const key = JOB_KEY.exec(line);
			if (key !== null && key[2] !== undefined) {
				const width = key[1]?.length ?? 0;
				if (jobIndent === undefined || width <= jobIndent)
					jobIndent = REHEARSAL_BRANCH_GATED_JOBS.includes(key[2])
						? width
						: undefined;
			}
			return jobIndent !== undefined && IF_KEY.test(line)
				? line.replace(named, () => `refs/heads/${branch}`)
				: line;
		})
		.join('\n');
};

/**
 * `text` with the project's integration branch, wherever a `branches` filter
 * under `on:` names it, replaced by the rehearsal branch. Every other entry
 * stays, so a list that also names the release branch still does. Only the
 * trigger block changes; steps, jobs and the pinned actions stay as the
 * project wrote them.
 */
export const renderBranchFilters = (
	text: string,
	branch: string,
	projectIntegration: string,
): string => {
	const out: string[] = [];
	let inOn = false;
	let inBlockList = false;
	for (const line of text.split('\n')) {
		if (TOP_KEY.test(line)) inOn = /^(on|"on"|'on'):/u.test(line);
		const inline = inOn ? BRANCHES_INLINE.exec(line) : null;
		if (inline !== null) {
			const items = (inline[2] ?? '')
				.split(',')
				.map((entry) =>
					unquoted(entry) === projectIntegration
						? `${/^\s*/u.exec(entry)?.[0] ?? ''}'${branch}'`
						: entry,
				);
			out.push(`${inline[1] ?? ''}branches: [${items.join(',')}]`);
			inBlockList = false;
			continue;
		}
		if (inOn && BRANCHES_BLOCK.test(line)) {
			inBlockList = true;
			out.push(line);
			continue;
		}
		const item = inBlockList ? BLOCK_ITEM.exec(line) : null;
		if (item !== null) {
			out.push(
				item[3] === projectIntegration
					? `${item[1] ?? ''}'${branch}'${item[4] ?? ''}`
					: line,
			);
			continue;
		}
		if (inBlockList && !/^\s*(#.*)?$/u.test(line)) inBlockList = false;
		out.push(line);
	}
	return renderGatedJobs(out.join('\n'), branch, projectIntegration);
};

/** The files a real-mode setup commit writes: the project's CI and scan workflows for the rehearsal branch. */
export const realModeFiles = (input: {
	readonly integration: string;
	/** The project's own integration branch name, which the rehearsal branch stands in for. */
	readonly projectIntegration: string;
	/** Workflow file name → its text, as the project has them. */
	readonly workflows: Readonly<Record<string, string>>;
}): readonly IRehearsalFileChange[] =>
	Object.entries(input.workflows).map(([name, text]) => ({
		path: `${WORKFLOWS}/${name}`,
		content: withSignalJob(
			renderBranchFilters(
				text,
				input.integration,
				input.projectIntegration,
			),
			input.integration,
		),
	}));

/** The ids of the jobs `text` declares and the indent they sit at, or `undefined` without a `jobs:` block. */
const declaredJobs = (
	text: string,
): { readonly ids: readonly string[]; readonly indent: number } | undefined => {
	const lines = text.split('\n');
	const start = lines.findIndex((line) => JOBS_KEY.test(line));
	if (start < 0) return undefined;
	let indent: number | undefined;
	const ids: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (/^\S/u.test(line)) break;
		const key = JOB_KEY.exec(line);
		if (key === null) continue;
		const width = key[1]?.length ?? 0;
		indent ??= width;
		if (width === indent && key[2] !== undefined) ids.push(key[2]);
	}
	return indent === undefined ? undefined : { ids, indent };
};

const SIGNAL_JOB_ID = 'integration-signal';
/** Columns of the template the signal job is rendered at: a job key, and a step item inside it. */
const TEMPLATE_JOB_COLUMN = 4;
const TEMPLATE_STEP_COLUMN = 12;
/** Columns inside a step item, counted from its dash: its keys, their children, a block's continuation. */
const STEP_KEYS = 2;
const STEP_CHILDREN = 6;
const STEP_CONTINUATION = 8;
const DASH_WIDTH = 2;

/**
 * One line of the template at the target's indent. The levels up to the
 * step item scale with the unit; inside a step the keys sit after the dash
 * (never scaled), their children one unit deeper and a block's continuation
 * two spaces beyond that, so no list item is ever mis-aligned.
 */
const placed = (line: string, unit: number, jobsIndent: number): string => {
	const text = line.trimStart();
	if (text === '') return '';
	const column = line.length - text.length;
	const stepAt = TEMPLATE_STEP_COLUMN - TEMPLATE_JOB_COLUMN;
	const offset = column - TEMPLATE_JOB_COLUMN;
	const pad = (width: number): string => ' '.repeat(width);
	if (offset <= stepAt)
		return `${pad(jobsIndent + (offset / TEMPLATE_JOB_COLUMN) * unit)}${text}`;
	const stepIndent = jobsIndent + (stepAt / TEMPLATE_JOB_COLUMN) * unit;
	const inside = column - TEMPLATE_STEP_COLUMN;
	const within =
		inside === STEP_KEYS
			? DASH_WIDTH
			: inside === STEP_CHILDREN
				? DASH_WIDTH + unit
				: inside === STEP_CONTINUATION
					? DASH_WIDTH + unit + DASH_WIDTH
					: inside;
	return `${pad(stepIndent + within)}${text}`;
};

/**
 * `text` with the signal job appended after its last job, so a finished CI
 * wakes the integrator on the rehearsal branch. A file that is no pull
 * request CI, has no jobs block, or already has the signal job is returned
 * as it is; the job never waits on itself.
 */
export const withSignalJob = (text: string, integration: string): string => {
	const jobs = declaredJobs(text);
	if (jobs === undefined || !PULL_REQUEST_TRIGGER.test(text)) return text;
	if (jobs.ids.includes(SIGNAL_JOB_ID)) return text;
	const signal = renderSignalJob({
		needs: jobs.ids.filter((id) => id !== SIGNAL_JOB_ID),
		integrationBranch: integration,
	})
		.trimEnd()
		.split('\n')
		.map((line) => placed(line, jobs.indent, jobs.indent))
		.join('\n');
	return `${text.trimEnd()}\n\n${signal}\n`;
};
