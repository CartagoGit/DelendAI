/**
 * init-vscode-settings.ts — teach the editor that
 * `delendai.config.json` is JSONC.
 *
 * The config file is JSONC by contract: it carries comments, and `init`
 * writes them. VS Code treats a `.json` file as strict JSON, so every
 * `//` in the file is flagged as a syntax error — the editor tells the
 * person that the file `init` just wrote is broken. The file
 * association is the one line that stops it.
 *
 * The settings file belongs to the person, not to us. An existing one
 * is edited in place through the JSONC editor: every other key, every
 * comment and the original formatting stay exactly as they were. Only
 * the association is added, and adding it twice changes nothing.
 *
 * VS Code writes the setting under the DOTTED name `"files.associations"`
 * — that is the form its own UI produces. A settings file that nests it
 * (`"files": { "associations": … }`) is read too, because VS Code
 * accepts both, and adding the association where the person already put
 * it is the polite thing to do.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	applyJsoncEdits,
	parseJsonc,
	type IJsoncEdit,
} from '@delendai/core/cli';

import { writeWorkspaceFileSafely } from '../config-file.service';

import {
	CONFIG_FILENAME,
	DOTTED_ASSOCIATIONS_KEY,
	JSONC_ASSOCIATION,
	VSCODE_SETTINGS_RELPATH,
} from '../../contracts/constants/init.constant';
import type { IVscodeSettingsResult } from '../../contracts/interfaces/init.interface';

/**
 * The member at a path, or nothing.
 *
 * A helper rather than a direct lookup: a linter rewriting
 * `settings['files.associations']` into `settings.files.associations`
 * would read a different key entirely.
 */
const memberAt = (record: Record<string, unknown>, key: string): unknown =>
	record[key];

/**
 * Where the association already is in this document, if it is.
 *
 * Both spellings are checked because VS Code accepts both, and a person
 * who wrote one of them means it.
 */
const associationPathIn = (
	settings: Record<string, unknown>,
): readonly string[] | undefined => {
	const dotted = settings[DOTTED_ASSOCIATIONS_KEY];
	if (dotted !== null && typeof dotted === 'object' && !Array.isArray(dotted))
		return [DOTTED_ASSOCIATIONS_KEY];
	const files = memberAt(settings, 'files');
	if (files === null || typeof files !== 'object' || Array.isArray(files))
		return undefined;
	const associations = memberAt(
		files as Record<string, unknown>,
		'associations',
	);
	if (
		associations !== null &&
		typeof associations === 'object' &&
		!Array.isArray(associations)
	)
		return ['files', 'associations'];
	return undefined;
};

/** True when the document already maps the config file to `jsonc`. */
const alreadyAssociated = (settings: Record<string, unknown>): boolean => {
	const path = associationPathIn(settings);
	if (path === undefined) return false;
	let cursor: unknown = settings;
	for (const segment of path) {
		if (cursor === null || typeof cursor !== 'object') return false;
		cursor = memberAt(cursor as Record<string, unknown>, segment);
	}
	if (cursor === null || typeof cursor !== 'object') return false;
	return (
		memberAt(cursor as Record<string, unknown>, CONFIG_FILENAME) === 'jsonc'
	);
};

/**
 * The settings text with the association added, or `undefined` when it
 * is already there or cannot be changed safely.
 *
 * Pure: same text, same answer. The caller owns the file.
 */
export const mergeJsoncAssociation = (text: string): string | undefined => {
	const { value, errors } = parseJsonc(text);
	if (errors.length > 0) return undefined;
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		return undefined;
	const settings = value as Record<string, unknown>;
	if (alreadyAssociated(settings)) return undefined;
	const existing = associationPathIn(settings);
	const edit: IJsoncEdit =
		existing === undefined
			? {
					path: [DOTTED_ASSOCIATIONS_KEY],
					value: { [CONFIG_FILENAME]: 'jsonc' },
				}
			: {
					path: [...existing, CONFIG_FILENAME],
					value: 'jsonc',
				};
	return applyJsoncEdits(text, [edit]);
};

/**
 * Ensure the project's editor treats the config as JSONC.
 *
 * A settings file that does not exist is created with the association.
 * One that does exists is read, and only the association is written
 * back — the person's own keys and comments survive, because a file
 * they wrote is not ours to reformat.
 */
export const ensureJsoncAssociation = async (
	workspace: string,
): Promise<IVscodeSettingsResult> => {
	const path = join(workspace, VSCODE_SETTINGS_RELPATH);
	if (!existsSync(path)) {
		const written = await writeWorkspaceFileSafely(
			workspace,
			VSCODE_SETTINGS_RELPATH,
			`${JSON.stringify(JSONC_ASSOCIATION, null, '\t')}\n`,
		);
		return { kind: 'written', path: written };
	}
	const existing = await readFile(path, 'utf8');
	const merged = mergeJsoncAssociation(existing);
	if (merged === undefined) {
		// Either the association is already there (nothing to do) or the
		// file is not a settings object we may touch.
		const { value, errors } = parseJsonc(existing);
		const settings =
			errors.length === 0 &&
			value !== null &&
			typeof value === 'object' &&
			!Array.isArray(value)
				? (value as Record<string, unknown>)
				: undefined;
		return {
			kind:
				settings !== undefined && alreadyAssociated(settings)
					? 'merged'
					: 'exists',
			path,
		};
	}
	const written = await writeWorkspaceFileSafely(
		workspace,
		VSCODE_SETTINGS_RELPATH,
		merged,
	);
	return { kind: 'written', path: written };
};
