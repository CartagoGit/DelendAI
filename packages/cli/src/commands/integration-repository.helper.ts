import type { IRehearsalCommandRunner } from '@delendai/integration/public';

/** `owner/name` of the repository `gh` is pointed at, or why it could not be named. */
export const repositorySlugOf = async (
	runGh: IRehearsalCommandRunner,
): Promise<{ readonly slug: string } | { readonly error: string }> => {
	const named = await runGh([
		'repo',
		'view',
		'--json',
		'nameWithOwner',
		'--jq',
		'.nameWithOwner',
	]);
	const slug = named.stdout.trim();
	return named.exitCode !== 0 || slug === ''
		? {
				error: `gh could not name the repository: ${named.stderr.trim() || named.spawnError || 'no answer'}`,
			}
		: { slug };
};
