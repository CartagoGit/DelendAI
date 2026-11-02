/**
 * task-briefing.service.ts — a unit starts with its task.
 *
 * `work enter` is the one call every task passes through, and it said nothing
 * about the task: each agent rebuilt its goal, files and specs with searches.
 * Core keeps no planning vocabulary, so a plugin provides the briefing, and a
 * project with none enters as it always did. A briefing never fails an entry.
 */
import type {
	ITaskBriefing,
	ITaskBriefingRequest,
	TTaskBriefingProvider,
} from '../contracts/interfaces/work-briefing.interface';

let provider: TTaskBriefingProvider | undefined;

export const registerTaskBriefingProvider = (
	next: TTaskBriefingProvider | undefined,
): void => {
	provider = next;
};

export const taskBriefingFor = async (
	request: ITaskBriefingRequest,
): Promise<ITaskBriefing | undefined> => {
	try {
		return await provider?.(request);
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
	...task.specs.map((spec) => `  spec ${spec}`),
];
