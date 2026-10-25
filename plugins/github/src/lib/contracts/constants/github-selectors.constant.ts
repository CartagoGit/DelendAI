/**
 * github-selectors.constant.ts — the shapes a repository and an issue
 * selector may take before they reach `gh` or an API path. Unchecked, an
 * owner of `../..` or an issue of `1/comments` walked the URL elsewhere.
 */
import z from 'zod';

/** A GitHub user or organisation: letters, digits and inner hyphens. */
export const GITHUB_OWNER_SCHEMA = z
	.string()
	.regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u, 'not a GitHub owner');

/** A repository name: letters, digits, `.`, `_` and `-`, never `.` or `..`. */
export const GITHUB_REPOSITORY_SCHEMA = z
	.string()
	.regex(
		/^(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/u,
		'not a GitHub repository name',
	);

/** An issue or pull request: a positive number, or its `#n` spelling. */
export const GITHUB_NUMBER_SCHEMA = z.union([
	z.string().regex(/^#?[1-9]\d*$/u, 'not an issue or pull request number'),
	z.number().int().positive(),
]);
