/**
 * config-block-docs.ts — the comment `init` writes above each top-level
 * block of `delendai.config.json`.
 *
 * The schema already says what every property is for; this module puts
 * that sentence where the person actually reads it. A config file that
 * explains itself needs no second document, and the person who has
 * never seen the project can tell what a key does without leaving the
 * file.
 *
 * The prose is DERIVED from the schema rather than written twice. Two
 * copies of the same explanation drift, and the copy in the file is the
 * one a person trusts — so it must be the copy that cannot go stale.
 * One exception: `plugins`, where the schema says what the block IS and
 * the file can say what it does FOR YOU.
 *
 * Pure: same schema, same lines. No I/O.
 */
import z from 'zod';

import { CONFIG_FILE_SCHEMA } from './config-file-schema';

/**
 * How wide a comment row may be.
 *
 * The file is read in an editor next to the code, and a 200-character
 * row is a row nobody reads. 72 leaves room for the indent and the
 * `// ` marker inside an 80-column window.
 */
const COMMENT_WIDTH = 72;

/**
 * Prose that belongs to the file rather than to the property.
 *
 * `plugins` is the only one: the schema describes the block for
 * somebody editing it months later, and the file describes it for
 * somebody looking at it now.
 */
const BLOCK_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
	plugins: [
		'The plugins this project can use. Each one carries its own comment;',
		'the enabled ones are on, and the rest are one flag away.',
	],
};

/**
 * Wrap a sentence into comment rows.
 *
 * Breaking happens on word boundaries, and a word longer than the
 * width gets its own row rather than being cut in half — a truncated
 * word is worse than a long one.
 */
const wrap = (text: string, width: number): readonly string[] => {
	const rows: string[] = [];
	let row = '';
	for (const word of text.split(/\s+/u).filter((part) => part !== '')) {
		if (row === '') {
			row = word;
			continue;
		}
		if (`${row} ${word}`.length <= width) {
			row = `${row} ${word}`;
			continue;
		}
		rows.push(row);
		row = word;
	}
	if (row !== '') rows.push(row);
	return rows;
};

/**
 * The comment lines for each top-level property of the config.
 *
 * A property without a description in the schema gets no comment: an
 * empty comment teaches nothing and the schema guard is what makes
 * that gap visible.
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
	for (const [key, property] of Object.entries(schema.properties ?? {})) {
		const override = BLOCK_OVERRIDES[key];
		if (override !== undefined) {
			comments[key] = override;
			continue;
		}
		if (property.description === undefined) continue;
		comments[key] = wrap(property.description, COMMENT_WIDTH);
	}
	return comments;
};
