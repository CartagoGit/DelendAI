/**
 * init-vscode-settings.ts — f00794 S4: teach the editor that
 * `delendai.config.json` is JSONC.
 *
 * VS Code decides the language of a file from its extension, so a
 * `.json` file is parsed as strict JSON and every `//` in it is
 * reported as a syntax error. The config file is JSONC by contract —
 * `init` writes a comment above every block and every plugin entry, and
 * a person is expected to add their own — so the editor has to be
 * told, through `files.associations`, that this one file is JSONC.
 *
 * A project's `.vscode/settings.json` belongs to the project: it may
 * carry comments, unknown keys, and a formatting the owner chose. So
 * the association is MERGED into the existing document with the JSONC
 * editor — every other key, every comment and the key order survive —
 * and the file is only rewritten when the association actually
 * changes something.
 *
 * Pure: the merge works on text. The file access lives in
 * `init-writers.factory.ts`.
 */
import {
	applyJsoncEdits,
	parseJsonc,
	type IJsoncEdit,
} from '@delendai/core/cli';

/** The file the association is about. */
export const DELENDAI_CONFIG_FILENAME = 'delendai.config.json';

/** The language id the file must be treated as. */
export const JSONC_LANGUAGE_ID = 'jsonc';

/** Where the association lives in a VS Code settings document. */
const ASSOCIATIONS_KEY = 'files.associations';

/**
 * The `.vscode/settings.json` a project without one receives: the
 * association, and nothing else.
 */
export const renderVscodeSettings = (): string =>
	`${JSON.stringify(
		{
			[ASSOCIATIONS_KEY]: {
				[DELENDAI_CONFIG_FILENAME]: JSONC_LANGUAGE_ID,
			},
		},
		null,
		'\t',
	)}\n`;

/** What happened to the association. */
export type IVscodeSettingsMerge =
	/** The association was added; `content` is the document to write. */
	| { readonly kind: 'merged'; readonly content: string }
	/** The document already says it; nothing to write. */
	| { readonly kind: 'unchanged' }
	/** The document cannot carry the association; it was left alone. */
	| { readonly kind: 'refused' };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Merge the association into an existing `settings.json`.
 *
 * The document is parsed as JSONC — VS Code's own format for it — and
 * the association is set as an edit against that text, so what the
 * owner wrote around it is preserved byte-for-byte.
 */
export const mergeVscodeSettings = (
	currentText: string,
): IVscodeSettingsMerge => {
	const { value, errors } = parseJsonc(currentText);
	if (errors.length > 0) return { kind: 'refused' };
	if (!isPlainObject(value)) return { kind: 'refused' };

	const associations = value[ASSOCIATIONS_KEY];
	if (associations === undefined) {
		const edits: IJsoncEdit[] = [
			{
				path: [ASSOCIATIONS_KEY],
				value: { [DELENDAI_CONFIG_FILENAME]: JSONC_LANGUAGE_ID },
			},
		];
		return { kind: 'merged', content: applyJsoncEdits(currentText, edits) };
	}
	// `files.associations` exists but is not a map: the owner wrote
	// something else under that name. Refuse rather than destroy it.
	if (!isPlainObject(associations)) return { kind: 'refused' };
	if (associations[DELENDAI_CONFIG_FILENAME] === JSONC_LANGUAGE_ID) {
		return { kind: 'unchanged' };
	}
	const edits: IJsoncEdit[] = [
		{
			path: [ASSOCIATIONS_KEY, DELENDAI_CONFIG_FILENAME],
			value: JSONC_LANGUAGE_ID,
		},
	];
	return { kind: 'merged', content: applyJsoncEdits(currentText, edits) };
};
