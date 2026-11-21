/**
 * task-briefing.service.ts — a unit starts with its task.
 *
 * `work enter` is the one call every task passes through, and it said nothing
 * about the task: each agent rebuilt its goal, files and specs with searches.
 * Core keeps no planning vocabulary, so a plugin provides the briefing, and a
 * project with none enters as it always did. A briefing never fails an entry.
 */

import {
	BRIEFING_PATH_CAP,
	TASK_FLOW,
} from '../contracts/constants/task-briefing.constant';
import type {
	ITaskBriefing,
	ITaskReach,
	ITaskReachProvider,
	ITaskBriefingRequest,
	ITaskBriefingProvider,
} from '../contracts/interfaces/work-briefing.interface';

import {
	readSources,
	repositoryImportGraph,
} from '../import-graph/import-graph-cache.service';
import { taskReachIn } from '../import-graph/task-reach.service';

let provider: ITaskBriefingProvider | undefined;

export const registerTaskBriefingProvider = (
	next: ITaskBriefingProvider | undefined,
): void => {
	provider = next;
};

/** The reach read from the project's own import graph, kept per git tree. */
export const repositoryTaskReach: ITaskReachProvider = async (
	worktree,
	files,
) =>
	taskReachIn(
		await repositoryImportGraph(worktree),
		files,
		await readSources(worktree, files),
	);

let reachOf: ITaskReachProvider = repositoryTaskReach;

/** Replace how reach is read; with no argument, the repository's graph. */
export const registerTaskReachProvider = (
	next: ITaskReachProvider | undefined,
): void => {
	reachOf = next ?? repositoryTaskReach;
};

const safeReach = async (
	request: ITaskBriefingRequest,
	files: readonly string[],
): Promise<ITaskReach | undefined> => {
	try {
		return files.length === 0
			? undefined
			: await reachOf(request.worktree, files);
	} catch {
		return undefined;
	}
};

export const taskBriefingFor = async (
	request: ITaskBriefingRequest,
): Promise<ITaskBriefing | undefined> => {
	try {
		const task = await provider?.(request);
		if (task === undefined) return undefined;
		const reach = await safeReach(
			request,
			task.files.map((file) => file.path),
		);
		return {
			...task,
			files: task.files.slice(0, BRIEFING_PATH_CAP),
			specs: [...new Set([...task.specs, ...(reach?.specs ?? [])])].slice(
				0,
				BRIEFING_PATH_CAP,
			),
			consumers: (reach?.consumers ?? []).slice(0, BRIEFING_PATH_CAP),
			flow: TASK_FLOW,
		};
	} catch {
		return undefined;
	}
};

/** The task as a person reads it on entering. */
export const describeTaskBriefing = (
	task: ITaskBriefing,
): readonly string[] => [
	`task             ${task.goal}`,
	...task.slices.flatMap((slice) => [
		`  ${slice.id}: ${slice.title}`,
		...slice.acceptance.map((line) => `    - ${line}`),
	]),
	...task.files.map(
		(file) =>
			`  file ${file.path} ${file.bytes === undefined ? '(new)' : `(${String(file.bytes)} B)`}`,
	),
	...(task.consumers ?? []).map((path) => `  consumer ${path}`),
	...task.specs.map((spec) => `  spec ${spec}`),
	...(task.flow === undefined ? [] : [`  ${task.flow}`]),
];
