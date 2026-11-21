/**
 * task-briefing.service.ts — a unit starts with its task.
 *
 * `work enter` is the one call every task passes through, and it said nothing
 * about the task: each agent rebuilt its goal, files and specs with searches.
 * Core keeps no planning vocabulary, so a plugin provides the briefing, and a
 * project with none enters as it always did. A briefing never fails an entry.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

let provider: ITaskBriefingProvider | undefined;

export const registerTaskBriefingProvider = (
	next: ITaskBriefingProvider | undefined,
): void => {
	provider = next;
};

const SPEC = /\.(?:spec|test)\.tsx?$/u;

/**
 * The reach read from the repository's own affected-specs / near-specs
 * graph, when the worktree carries it. A project without it gets nothing.
 */
export const repositoryTaskReach: ITaskReachProvider = async (
	worktree,
	files,
) => {
	const load = async (name: string): Promise<Record<string, unknown>> =>
		(await import(
			pathToFileURL(join(worktree, 'tools/scripts/ci', name)).href
		)) as Record<string, unknown>;
	const near = (await load('near-specs.ts')) as {
		consumerSpecs: (input: unknown) => readonly string[];
	};
	const graph = (await load('affected-specs.service.ts')) as {
		repositorySince: (root: string, base: string) => { changed: unknown };
		affectedFiles: (input: unknown, hops: number) => readonly string[];
	};
	const input = {
		...graph.repositorySince(worktree, 'HEAD'),
		changed: files,
	};
	return {
		consumers: graph
			.affectedFiles(input, 1)
			.filter((file) => !files.includes(file) && !SPEC.test(file)),
		specs: near.consumerSpecs(input),
	};
};

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
