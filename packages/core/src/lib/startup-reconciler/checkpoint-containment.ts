/**
 * checkpoint-containment.ts — whether the integration branch already
 * holds what a checkpoint carries, when ancestry alone says no.
 */
import type { IGitRunner } from '../contracts/interfaces/git-runner.interface';
import { parentsOutsideMerges } from '../work-units/landed-work.service';

export const checkpointContainment = (
	run: IGitRunner,
	isAncestor: (ancestor: string, descendant: string) => Promise<boolean>,
) => {
	const onlyLandedMerges = async (
		sha: string,
		integration: string,
	): Promise<boolean> => {
		const listed = await run([
			'rev-list',
			'--parents',
			`${integration}..${sha}`,
		]);
		if (!listed.ok) return false;
		const outside = parentsOutsideMerges(listed.output);
		if (outside === undefined) return false;
		for (const parent of outside) {
			if (!(await isAncestor(parent, integration))) return false;
		}
		return true;
	};

	const contentContained = async (
		sha: string,
		integration: string,
	): Promise<boolean> => {
		if (sha.length === 0 || integration.length === 0) return false;
		const base = await run(['merge-base', sha, integration]);
		if (!base.ok) return false;
		const changed = await run([
			'diff',
			'--name-only',
			base.output.trim(),
			sha,
		]);
		if (!changed.ok) return false;
		const paths = changed.output
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		// Nothing changed since the fork: an empty checkpoint carries
		// nothing the integration branch could be missing.
		if (paths.length === 0) return true;
		// A checkpoint that only merged the integration branch into work
		// it already holds adds nothing, even after the integration branch
		// changed the same files again.
		if (await onlyLandedMerges(sha, integration)) return true;
		const same = await run([
			'diff',
			'--quiet',
			sha,
			integration,
			'--',
			...paths,
		]);
		return same.ok;
	};

	return { contentContained };
};
