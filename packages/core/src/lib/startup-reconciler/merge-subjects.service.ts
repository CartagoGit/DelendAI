/**
 * merge-subjects.service.ts — the subjects of the integration branch's own
 * merges, which name the branch each came from.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';

/** How far back the integration branch's merges are read. */
const MERGES_READ = 3000;

/** Newest first; none when git cannot list them. */
export const mergeSubjectsReader =
	(run: IGitRunner) =>
	async (integration: string): Promise<readonly string[]> => {
		const listed = await run([
			'log',
			'--merges',
			'--first-parent',
			`--max-count=${String(MERGES_READ)}`,
			'--format=%s',
			integration,
		]);
		return listed.ok
			? listed.output.split('\n').filter((line) => line.length > 0)
			: [];
	};
