/**
 * init.constant.ts — the names `init` writes and the one the editor
 * must be told about.
 *
 * These are contracts rather than private helpers because they are
 * read by more than the writer: the association key is what the
 * VS Code settings file is expected to carry, and the file name is
 * the one every reader of `delendai.config.json` agrees on.
 */
import { DEFAULT_CONFIG_FILENAME } from '@delendai/core/public';

/** Where the published schema lives; the editor reads it from here. */
export const CONFIG_SCHEMA_URL =
	'https://unpkg.com/@delendai/core/schema/delendai.config.schema.json';

/** Where the association lives, relative to the workspace root. */
export const VSCODE_SETTINGS_RELPATH = '.vscode/settings.json';

/** The file whose language the association changes. */
export const CONFIG_FILENAME = DEFAULT_CONFIG_FILENAME;

/** The dotted key VS Code itself writes. */
export const DOTTED_ASSOCIATIONS_KEY = 'files.associations';

/** The association, as the editor expects it. */
export const JSONC_ASSOCIATION = {
	[DOTTED_ASSOCIATIONS_KEY]: {
		[CONFIG_FILENAME]: 'jsonc',
	},
} as const;
