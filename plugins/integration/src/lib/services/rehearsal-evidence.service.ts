/**
 * rehearsal-evidence.service.ts — a rehearsal report read back from the
 * forge: the artifact of the latest completed `rehearsal` run of one
 * commit. Reports are evidence keyed by commit, never a file in the tree.
 */
import {
	REHEARSAL_PAGE_SIZE,
	REHEARSAL_WORKFLOW_PATH,
	rehearsalReportArtifact,
} from '../contracts/constants/rehearsal.constant';
import type {
	IRehearsalCommandRunner,
	IRehearsalReport,
} from '../contracts/interfaces/rehearsal.interface';

interface IRun {
	readonly id: number;
	readonly head_sha: string;
	readonly created_at: string;
}

interface IArtifact {
	readonly name: string;
	readonly expired?: boolean;
}

const WORKFLOW_FILE = REHEARSAL_WORKFLOW_PATH.split('/').pop() ?? '';

/** The report of `mode` for `tip`, or none; `download` gives the artifact's report text. */
export const createRehearsalEvidence = (input: {
	readonly slug: string;
	readonly run: IRehearsalCommandRunner;
	readonly download: (
		runId: number,
		artifact: string,
	) => Promise<string | undefined>;
}): {
	readonly reportOf: (
		mode: string,
		tip: string,
	) => Promise<IRehearsalReport | undefined>;
} => {
	const json = async <T>(path: string): Promise<T> => {
		const out = await input.run(['api', path]);
		if (out.exitCode !== 0)
			throw new Error(
				`the forge refused ${path}: ${out.stderr.trim() || out.spawnError || 'no answer'}`,
			);
		return JSON.parse(out.stdout) as T;
	};
	return {
		reportOf: async (mode, tip) => {
			const name = rehearsalReportArtifact(mode);
			const { workflow_runs: runs } = await json<{
				workflow_runs: IRun[];
			}>(
				`repos/${input.slug}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${tip}&status=completed&per_page=${String(REHEARSAL_PAGE_SIZE)}`,
			);
			const latestFirst = runs
				.filter((run) => run.head_sha === tip)
				.sort((a, b) => b.created_at.localeCompare(a.created_at));
			for (const run of latestFirst) {
				const { artifacts } = await json<{ artifacts: IArtifact[] }>(
					`repos/${input.slug}/actions/runs/${String(run.id)}/artifacts?per_page=${String(REHEARSAL_PAGE_SIZE)}`,
				);
				if (
					!artifacts.some(
						(artifact) =>
							artifact.name === name && artifact.expired !== true,
					)
				)
					continue;
				const text = await input.download(run.id, name);
				if (text === undefined) continue;
				return JSON.parse(text) as IRehearsalReport;
			}
			return undefined;
		},
	};
};
