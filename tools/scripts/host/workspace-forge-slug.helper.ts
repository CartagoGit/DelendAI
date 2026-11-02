/**
 * workspace-forge-slug.helper.ts — the forge repository a workspace's own
 * remote names, so the host reads that repository's pull requests and
 * checks, and not delendai's.
 *
 * The host passed delendai's own slug to its forge seam for every
 * workspace: a project that uses delendai had its startup mirror of pull
 * requests and check runs read delendai's own.
 */
import { readGit } from '@delendai/core/runtime';

/**
 * `owner/name` of a remote URL, ssh or https, on any host: a forge the
 * host cannot read answers "not read", which is honest; what was wrong
 * was asking about another repository.
 */
export const forgeSlugOf = (url: string): string | undefined => {
	const match =
		/^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?[^:/\s]+[:/]+(?:.*\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/u.exec(
			url.trim(),
		);
	return match === null ? undefined : `${match[1]}/${match[2]}`;
};

/** The slug of `root`'s `origin`, or `undefined` when there is none to read. */
export const workspaceForgeSlug = (
	root: string,
	readUrl: (cwd: string) => string | undefined = (cwd) =>
		readGit(cwd, ['remote', 'get-url', 'origin'], { verbatim: true }),
): string | undefined => {
	try {
		const url = readUrl(root);
		return url === undefined ? undefined : forgeSlugOf(url);
	} catch {
		return undefined;
	}
};
