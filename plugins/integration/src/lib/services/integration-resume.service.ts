/**
 * integration-resume.service.ts — after activation merges, the pull
 * requests that were paused go back into the flow: each one labelled
 * `<prefix>:paused` is marked ready for review and loses the label, and the
 * integrator lands them with no further step.
 */
import {
	REHEARSAL_PAGE_LIMIT,
	REHEARSAL_PAGE_SIZE,
} from '../contracts/constants/rehearsal.constant';
import type {
	IResumeForge,
	IResumePull,
} from '../contracts/interfaces/integration-resume.interface';
import type { IRehearsalCommandRunner } from '../contracts/interfaces/rehearsal.interface';

/** The label that holds a pull request out of the flow while the engine is off. */
export const pausedLabel = (prefix: string): string => `${prefix}:paused`;

/** The pull requests into `base` that carry the paused label are resumed; the list says what was done. */
export const resumeIntegration = async (input: {
	readonly forge: IResumeForge;
	readonly base: string;
	readonly prefix: string;
}): Promise<readonly number[]> => {
	const label = pausedLabel(input.prefix);
	const resumed: number[] = [];
	for (const pull of await input.forge.openPulls(input.base)) {
		if (!pull.labels.includes(label)) continue;
		await input.forge.markReady(pull);
		await input.forge.removeLabel(pull.number, label);
		resumed.push(pull.number);
	}
	return resumed;
};

interface IRawPull {
	readonly number: number;
	readonly node_id: string;
	readonly labels?: readonly { readonly name: string }[];
}

/** `IResumeForge` on GitHub through `gh`, signed in as whoever is. */
export const createGithubResumeForge = (input: {
	readonly slug: string;
	readonly run: IRehearsalCommandRunner;
}): IResumeForge => {
	const call = async (args: readonly string[]): Promise<string> => {
		const out = await input.run(args);
		if (out.exitCode !== 0)
			throw new Error(
				`gh ${args.slice(0, 3).join(' ')} failed: ${out.stderr.trim() || out.spawnError || 'no answer'}`,
			);
		return out.stdout;
	};
	return {
		openPulls: async (base) => {
			const pulls: IResumePull[] = [];
			for (let page = 1; page <= REHEARSAL_PAGE_LIMIT; page += 1) {
				const got = JSON.parse(
					await call([
						'api',
						`repos/${input.slug}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=${String(REHEARSAL_PAGE_SIZE)}&page=${String(page)}`,
					]),
				) as IRawPull[];
				pulls.push(
					...got.map((pull) => ({
						number: pull.number,
						nodeId: pull.node_id,
						labels: (pull.labels ?? []).map((l) => l.name),
					})),
				);
				if (got.length < REHEARSAL_PAGE_SIZE) return pulls;
			}
			throw new Error(
				'there are more open pull requests than resume reads',
			);
		},
		markReady: async (pull) => {
			await call([
				'api',
				'graphql',
				'-f',
				'query=mutation($id: ID!) { markPullRequestReadyForReview(input: {pullRequestId: $id}) { clientMutationId } }',
				'-f',
				`id=${pull.nodeId}`,
			]);
		},
		removeLabel: async (number, label) => {
			await call([
				'api',
				'--method',
				'DELETE',
				`repos/${input.slug}/issues/${String(number)}/labels/${encodeURIComponent(label)}`,
			]);
		},
	};
};
