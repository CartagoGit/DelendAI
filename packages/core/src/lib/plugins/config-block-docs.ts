/**
 * config-block-docs.ts — f00794 S3: the comment `delendai init` writes
 * above each top-level block of `delendai.config.json`.
 *
 * The config file is JSONC by contract and its plugin entries already
 * carry a comment that says what the plugin does (see
 * `plugin-config-docs.ts`). The top-level blocks did not: a person who
 * had just run `init` opened the file and met `cacheDir`, `docsDir`,
 * `plugins` and `development` with nothing but a key name.
 *
 * The prose already exists — the schema describes every property of the
 * config — so this module DERIVES the comment from the schema instead of
 * keeping a second copy of it. One source, two surfaces: the description
 * an editor shows and the comment a person reads can never disagree.
 *
 * Pure: same schema, same lines. No I/O.
 */
import z from 'zod';

import { CONFIG_FILE_SCHEMA } from './config-file-schema';

/**
 * The width of one comment row, in characters of prose.
 *
 * The row is rendered as `// <row>` under the block's own indentation,
 * so the finished line lands a little past 72 columns in the editor —
 * still inside the 80-column budget the repo formats to.
 */
const COMMENT_ROW_WIDTH = 72;

/**
 * Wrap one paragraph into rows of at most `width` characters, breaking
 * on word boundaries.
 *
 * A single word longer than the width is left whole: splitting it
 * would change what it says, and a long word is rare enough that the
 * overlong row is the better trade.
 */
const wrapRows = (text: string, width: number): readonly string[] => {
	const rows: string[] = [];
	let current = '';
	for (const word of text.split(/\s+/u)) {
		if (word.length === 0) continue;
		if (current.length === 0) {
			current = word;
			continue;
		}
		if (`${current} ${word}`.length <= width) {
			current = `${current} ${word}`;
			continue;
		}
		rows.push(current);
		current = word;
	}
	if (current.length > 0) rows.push(current);
	return rows;
};

/**
 * The comment rows for every top-level property of the config schema,
 * keyed by property name.
 *
 * A property the schema does not describe yields no entry: the schema
 * is the source of truth, and a block nothing says anything about gets
 * no invented explanation.
 */
export const renderConfigBlockComments = (): Readonly<
	Record<string, readonly string[]>
> => {
	const schema = z.toJSONSchema(CONFIG_FILE_SCHEMA) as {
		readonly properties?: Readonly<
			Record<string, { readonly description?: string }>
		>;
	};
	const comments: Record<string, readonly string[]> = {};
	for (const [property, node] of Object.entries(schema.properties ?? {})) {
		if (node.description === undefined) continue;
		comments[property] = wrapRows(node.description, COMMENT_ROW_WIDTH);
	}
	return comments;
};
