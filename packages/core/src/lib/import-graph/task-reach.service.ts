/**
 * task-reach.service.ts — what a task's files reach, read from the import graph.
 *
 * Any project with TypeScript gets the consumers of a task's files and the
 * specs among them; no repository tooling is needed.
 */
import type { ITaskReach } from '../contracts/interfaces/work-briefing.interface';
import type { IImportGraph } from '../contracts/interfaces/import-graph.interface';
import { affectedFilesIn } from './import-graph.service';

const SPEC = /\.(?:spec|test)\.tsx?$/u;

/** One importer step from `files`: their consumers, and the specs among them. */
export const taskReachIn = (
	graph: IImportGraph,
	files: readonly string[],
	read: (file: string) => string,
): ITaskReach => {
	const reached = affectedFilesIn(graph, { changed: files, read }, 1).filter(
		(file) => !files.includes(file),
	);
	return {
		consumers: reached.filter((file) => !SPEC.test(file)),
		specs: reached.filter((file) => SPEC.test(file)),
	};
};
