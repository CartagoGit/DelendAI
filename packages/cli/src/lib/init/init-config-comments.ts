/**
 * init-config-comments.ts — the edits that turn `delendai init`'s config
 * from a bare skeleton into a file that explains itself.
 *
 * `init` writes `delendai.config.json`. Written bare, it was a list of
 * keys whose meaning lived somewhere else — and the person who had just
 * run `init` was the person who knew the least about the project.
 *
 * The comments come from the schema (see `renderConfigBlockComments`),
 * so the file and the schema cannot disagree about what a key does.
 * This module's only job is to place them: every top-level block is
 * CREATED by an edit carrying its comment, because the JSONC editor
 * writes a leading comment only for a member that did not exist yet.
 *
 * That last detail is why the config is assembled here rather than
 * being a plain object that gets stringified. A member that was already
 * in the object would keep its value and silently lose its comment.
 */
import { renderConfigBlockComments } from '@delendai/core/cli';

import type { IJsoncEdit } from '@delendai/core/cli';

import { CONFIG_SCHEMA_URL } from '../../contracts/constants/init.constant';
import type { IConfigBlockInput } from '../../contracts/interfaces/init.interface';

/**
 * The comment for one block, or nothing when the schema has none.
 *
 * A helper rather than a direct lookup, because a direct lookup with a
 * literal key invites a linter to rewrite `comments['a.b']` into
 * `comments.a.b` — which reads a different key entirely.
 */
const commentFor = (
	comments: Readonly<Record<string, readonly string[]>>,
	key: string,
): readonly string[] | undefined => comments[key];

/**
 * One block edit, with its comment when there is one.
 *
 * The comment is omitted rather than set to `undefined`, because
 * `exactOptionalPropertyTypes` treats those as different things.
 */
const blockEdit = (
	path: readonly string[],
	value: unknown,
	comment: readonly string[] | undefined,
): IJsoncEdit => ({
	path: [...path],
	value,
	...(comment === undefined ? {} : { leadingComment: comment }),
});

/**
 * The edits that create every top-level block with its comment.
 *
 * The order of the list IS the order of the keys in the file, because
 * the editor appends a newly created member where the edit put it.
 */
export const buildConfigBlockEdits = (
	input: IConfigBlockInput,
): readonly IJsoncEdit[] => {
	const comments = renderConfigBlockComments();
	const edits: IJsoncEdit[] = [
		blockEdit(
			['$schema'],
			CONFIG_SCHEMA_URL,
			commentFor(comments, '$schema'),
		),
		blockEdit(
			['cacheDir'],
			'.cache/delendai',
			commentFor(comments, 'cacheDir'),
		),
		blockEdit(
			['docsDir'],
			'docs/delendai',
			commentFor(comments, 'docsDir'),
		),
	];
	if (input.hosts !== undefined) {
		edits.push(
			blockEdit(['hosts'], input.hosts, commentFor(comments, 'hosts')),
		);
	}
	edits.push(blockEdit(['plugins'], {}, commentFor(comments, 'plugins')));
	if (input.development !== undefined) {
		edits.push(
			blockEdit(
				['development'],
				input.development,
				commentFor(comments, 'development'),
			),
		);
	}
	if (input.convention !== undefined) {
		edits.push(
			blockEdit(
				['convention'],
				input.convention,
				commentFor(comments, 'convention'),
			),
		);
	}
	return edits;
};
