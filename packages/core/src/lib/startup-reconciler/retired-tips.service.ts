/**
 * retired-tips.service.ts — the commits the integration remote keeps as
 * retired work, so a unit given up on purpose is not taken for one lost.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { namespacedRef } from '../work-units/namespaced-ref.helper';

/**
 * Lists `refs/<namespace>/retired/*` on the integration remote, and
 * fetches the tips this clone lacks so that a checkpoint can be found
 * among their ancestors. Best effort: with no remote, or offline, the
 * answer is empty.
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
			'--',
			remote,
			namespacedRef(namespace, 'retired', '*'),
		]);
		if (!listed.ok) return [];
		const tips = listed.output
			.split('\n')
			.map((line) => line.split('\t')[0]?.trim() ?? '')
			.filter((sha) => sha.length > 0);
		// A tip this clone never fetched cannot answer an ancestry
		// question. The remote advertises it, so it is fetched by its
		// commit, without creating a ref here.
		const missing: string[] = [];
		for (const tip of tips) {
			const known = await run(['cat-file', '-e', `${tip}^{commit}`]);
			if (!known.ok) missing.push(tip);
		}
		if (missing.length > 0) {
			await run([
				'fetch',
				'--quiet',
				'--no-tags',
				'--no-write-fetch-head',
				'--',
				remote,
				...missing,
			]);
		}
		return tips;
	};
