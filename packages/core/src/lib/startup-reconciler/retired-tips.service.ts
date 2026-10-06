/**
 * retired-tips.service.ts — the commits the integration remote keeps as
 * retired work, so a unit given up on purpose is not taken for one lost.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { namespacedRef } from '../work-units/namespaced-ref.helper';

/**
 * Lists `refs/<namespace>/retired/*` on the integration remote. Best
 * effort: with no remote, or offline, the answer is empty.
 */
export const retiredTipsLister =
	(
		run: IGitRunner,
		integrationRemote: (branch: string) => Promise<string | undefined>,
	) =>
	async (
		namespace: string,
		integrationBranch: string,
	): Promise<readonly string[]> => {
		const remote = await integrationRemote(integrationBranch);
		if (remote === undefined) return [];
		const listed = await run([
			'ls-remote',
			remote,
			namespacedRef(namespace, 'retired', '*'),
		]);
		return listed.ok
			? listed.output
					.split('\n')
					.map((line) => line.split('\t')[0]?.trim() ?? '')
					.filter((sha) => sha.length > 0)
			: [];
	};
