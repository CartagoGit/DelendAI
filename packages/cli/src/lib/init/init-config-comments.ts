/**
 * init-config-comments.ts — f00794 S3: the comment above each
 * top-level block of the generated `delendai.config.json`.
 *
 * A person who has just run `delendai init` opens the file and reads
 * it. The plugin entries already explain themselves (see
 * `renderPluginConfigComment`); the top-level blocks did not, so
 * `cacheDir`, `docsDir`, `plugins` and `development` were bare keys
 * until somebody went looking for what they meant.
 *
 * The prose is NOT written here. It is derived from the config schema
 * (`renderConfigBlockComments`), which is the same source the published
 * JSON Schema comes from — so the comment a person reads in the file
 * and the description an editor shows can never disagree. The single
 * exception is the `plugins` block, whose comment says what the block
 * does FOR the person reading the file rather than what it is.
 *
 * The edits returned here are BLOCK edits: they create the members, so
 * that `applyJsoncEdits` — which writes a `leadingComment` only when it
 * creates the member — has somewhere to put the comment. The plugin
 * edits follow them and fill the `plugins` block that is already there,
 * commented.
 *
 * Pure: same options, same edits. No I/O.
 */
import { renderConfigBlockComments } from '@delendai/core/public';
import type { IJsoncEdit } from '@delendai/core/cli';

/**
 * The one block whose useful comment is not "what this is" but "what
 * this does for you". The schema describes `plugins` as per-plugin
 * configuration; at init time the person reading the file wants to know
 * this is where they turn plugins on and off.
 *
 * Every other block uses the schema's own description.
 */
const BLOCK_COMMENT_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
	plugins: ['The plugins this project can turn on.'],
};

/** The top-level blocks `init` writes, and the values it writes in them. */
export interface IConfigBlockOptions {
	/** The cache root, relative to the workspace. */
	readonly cacheDir: string;
	/** The documentation root, relative to the workspace. */
	readonly docsDir: string;
	/** The hosts the project uses — written only when the operator chose them. */
	readonly hosts?: readonly string[];
	/** The development block — written only when the project has one. */
	readonly development?: Record<string, unknown>;
	/** The layout block — written only when the detector found a non-default root. */
	readonly convention?: Record<string, unknown>;
}

/**
 * The block edits, in the order the blocks appear in the file.
 *
 * The order is the file's order — `$schema, cacheDir, docsDir, hosts?,
 * plugins, development?, convention?` — because `applyJsoncEdits`
 * appends a newly created member where the edit put it. `plugins` is
 * created empty here and filled by the plugin edits that follow.
 */
export const buildConfigBlockEdits = (
	options: IConfigBlockOptions,
): readonly IJsoncEdit[] => {
	const comments = renderConfigBlockComments();
	const edits: IJsoncEdit[] = [];
	const push = (block: string, value: unknown): void => {
		const comment = BLOCK_COMMENT_OVERRIDES[block] ?? comments[block] ?? [];
		edits.push({
			path: [block],
			value,
			...(comment.length === 0 ? {} : { leadingComment: comment }),
		});
	};
	push('cacheDir', options.cacheDir);
	push('docsDir', options.docsDir);
	if (options.hosts !== undefined) push('hosts', [...options.hosts]);
	push('plugins', {});
	if (options.development !== undefined) {
		push('development', options.development);
	}
	if (options.convention !== undefined) {
		push('convention', options.convention);
	}
	return edits;
};
