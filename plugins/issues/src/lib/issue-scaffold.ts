/**
 * Builds, serializes and parses the durable scaffold file persisted for
 * every analysed GitHub issue
 * (`docs/proposals/retired/issues/github#<n>-<slug>.md`).
 *
 * Single Responsibility: this module only knows the scaffold's *shape* —
 * how an `IGithubIssueDetail` + its comments become an `IIssueScaffold`,
 * and how that round-trips to/from a markdown file. It has no opinion
 * about GitHub API tiers (`github-client.ts`) or about file I/O
 * (`withFileMutex`/`writeFileAtomic` are wired by the tools in S3, not
 * here — this module is a pure builder/(de)serializer).
 *
 * Security contract (explicit in the proposal's "why this design"): all
 * user-authored text (issue body, comment bodies) is run through
 * `redactSecrets` *before* it is written into the scaffold body, so a
 * pasted token/credential never survives into a durable file on disk.
 */

import { createHash } from 'node:crypto';

import { redactSecrets } from '@mcp-vertex/core/public';

import type {
	IGithubComment,
	IGithubIssueDetail,
	IIssueScaffold,
	IIssueScaffoldFrontmatter,
} from './contracts/issue.types';
import {
	extractFrontmatterBlock,
	parseFrontmatterBlock,
	serializeFrontmatterBlock,
	splitFrontmatterAndBody,
} from './frontmatter';

/** Lowercase, hyphenated, ASCII-only slug derived from an issue title. */
export const slugify = (title: string): string => {
	const slug = title
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug === '' ? 'untitled' : slug;
};

/** Deterministic 4-char collision-disambiguation suffix for issue `number`. */
export const collisionSuffix = (number: number): string =>
	createHash('sha256').update(String(number)).digest('hex').slice(0, 4);

/**
 * Builds the canonical scaffold file name for an issue, e.g.
 * `github#123-fix-the-thing.md`. When `existingFileNames` already
 * contains that name (a slug collision from a different issue, since the
 * issue number is otherwise unique and would never collide with itself),
 * appends a deterministic 4-char hash suffix derived from the issue
 * number so retries are stable: `github#123-fix-the-thing-a1b2.md`.
 */
export const buildScaffoldFileName = (
	number: number,
	title: string,
	existingFileNames: ReadonlySet<string> = new Set(),
): string => {
	const slug = slugify(title);
	const base = `github#${number}-${slug}.md`;
	if (!existingFileNames.has(base)) return base;
	return `github#${number}-${slug}-${collisionSuffix(number)}.md`;
};

/** Redacts secrets from a single comment's body, leaving other fields untouched. */
const redactComment = (comment: IGithubComment): IGithubComment => ({
	...comment,
	body: redactSecrets(comment.body).text,
});

/**
 * Builds the typed `IIssueScaffold` for a freshly fetched issue. The body
 * markdown embeds the (redacted) issue body; comments are redacted and
 * stored structurally in the frontmatter (per `IIssueScaffoldFrontmatter`),
 * not duplicated in the body.
 */
export const buildScaffold = (
	issueDetail: IGithubIssueDetail,
	comments: readonly IGithubComment[],
): IIssueScaffold => {
	const redactedBody = redactSecrets(issueDetail.body).text;
	const redactedComments = comments.map(redactComment);

	const frontmatter: IIssueScaffoldFrontmatter = {
		source: 'github',
		source_id: issueDetail.number,
		source_url: issueDetail.url,
		source_author: issueDetail.author,
		ingested_at: new Date().toISOString(),
		status: 'ingested',
		resolution: 'pending',
		proposals: [],
		comments: redactedComments,
	};

	const bodyLines = [
		`# ${issueDetail.title}`,
		'',
		`> Source: ${issueDetail.url}`,
		`> Author: @${issueDetail.author}`,
		`> State: ${issueDetail.state}`,
		issueDetail.labels.length > 0
			? `> Labels: ${issueDetail.labels.join(', ')}`
			: '> Labels: (none)',
		'',
		redactedBody,
	];

	return { frontmatter, body: bodyLines.join('\n') };
};

/** Serializes an `IIssueScaffold` into the full markdown file content (frontmatter + body). */
export const serializeScaffold = (scaffold: IIssueScaffold): string => {
	const fenced = serializeFrontmatterBlock(scaffold.frontmatter);
	const body = scaffold.body.endsWith('\n')
		? scaffold.body
		: `${scaffold.body}\n`;
	return `${fenced}\n${body}`;
};

/**
 * Parses an existing scaffold file (as read from disk) back into an
 * `IIssueScaffold`. Throws if the file has no recognisable frontmatter
 * fence — a missing/corrupt scaffold should fail loudly so `issues_resolve`
 * never silently overwrites it with defaults.
 */
export const parseScaffold = (fileContent: string): IIssueScaffold => {
	const block = extractFrontmatterBlock(fileContent);
	if (block === null) {
		throw new Error('issue scaffold file has no frontmatter block');
	}
	const { body } = splitFrontmatterAndBody(fileContent);
	const frontmatter = parseFrontmatterBlock(block);
	return { frontmatter, body: body.replace(/^\n+/, '') };
};
