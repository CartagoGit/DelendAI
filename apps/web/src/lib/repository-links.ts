/**
 * repository-links.ts — every link the site gives to the project's
 * repository, from the one slug the product declares.
 *
 * The site spelled the repository four different ways, one of them under
 * another owner, so the setup guide link pointed at a repository that is
 * not this one.
 */
import { REPOSITORY_SLUG } from '@delendai/core/public';

/** The repository's home page. */
export const repositoryUrl = `https://github.com/${REPOSITORY_SLUG}`;

/** A file of the repository on its main branch, e.g. `docs/delendai/X.md`. */
export const repositoryFileUrl = (path: string): string =>
	`${repositoryUrl}/blob/main/${path.replace(/^\/+/u, '')}`;
