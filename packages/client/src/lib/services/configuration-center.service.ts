/**
 * Merge-aware project configuration document service for host UIs.
 *
 * Reads are redacted. Writes are expressed as path edits and are applied to a
 * fresh on-disk document under the shared file mutex, so values hidden from the
 * UI and fields owned by newer/external plugins are preserved byte-for-byte in
 * meaning. An optimistic digest turns external edits into explicit conflicts.
 */
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';

import {
	CONFIG_FILE_SCHEMA,
	DEFAULT_CONFIG_FILENAME,
	redactSecrets,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type {
	ConfigurationEdit,
	ConfigurationPathSegment,
	IConfigurationDocumentInput,
	IConfigurationDocumentSnapshot,
	IConfigurationValidationIssue,
	ISaveConfigurationDocumentInput,
	SaveConfigurationDocumentResult,
} from '../contracts/interfaces/configuration-edit.interface';

interface IReadDocument {
	readonly raw: string;
	readonly exists: boolean;
	readonly value: Record<string, unknown>;
}

const FORBIDDEN_PATH_SEGMENTS = new Set([
	'__proto__',
	'prototype',
	'constructor',
]);
const SECRET_FIELD =
	/(?:^|[_-])(?:api[_-]?key|access[_-]?key|secret|token|password|passwd|pwd|client[_-]?secret)$/iu;

const digestOf = (raw: string): string =>
	createHash('sha256').update(raw, 'utf8').digest('hex');

const configFileOf = (input: IConfigurationDocumentInput): string => {
	if (!isAbsolute(input.workspaceRoot)) {
		throw new Error('workspaceRoot must be absolute');
	}
	const name = input.configFileName ?? DEFAULT_CONFIG_FILENAME;
	if (
		name.length === 0 ||
		name === '.' ||
		name === '..' ||
		isAbsolute(name) ||
		basename(name) !== name
	) {
		throw new Error('configFileName must be a plain file name');
	}
	return join(input.workspaceRoot, name);
};

const readDocument = async (configFile: string): Promise<IReadDocument> => {
	try {
		const info = await lstat(configFile);
		if (info.isSymbolicLink()) {
			throw new Error(
				`Config file "${configFile}" must not be a symbolic link`,
			);
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { raw: '', exists: false, value: {} };
		}
		throw error;
	}

	let raw: string;
	try {
		raw = await readFile(configFile, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			return { raw: '', exists: false, value: {} };
		}
		throw new Error(`Unable to read config file "${configFile}"`, {
			cause: error,
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`Invalid JSON in config file "${configFile}"`, {
			cause: error,
		});
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		throw new Error(
			`Config file "${configFile}" must contain a JSON object`,
		);
	}
	return { raw, exists: true, value: parsed as Record<string, unknown> };
};

const redactValue = (
	value: Readonly<Record<string, unknown>>,
): { value: Readonly<Record<string, unknown>>; redactions: number } => {
	const result = redactSecrets(JSON.stringify(value));
	return {
		value: JSON.parse(result.text) as Readonly<Record<string, unknown>>,
		redactions: result.redactions,
	};
};

const snapshotOf = (
	configFile: string,
	document: IReadDocument,
): IConfigurationDocumentSnapshot => {
	const redacted = redactValue(document.value);
	return {
		configFile,
		exists: document.exists,
		digest: digestOf(document.raw),
		value: redacted.value,
		redactions: redacted.redactions,
	};
};

const pathLabel = (path: readonly ConfigurationPathSegment[]): string =>
	path.map(String).join('.');

const validatePath = (
	path: readonly ConfigurationPathSegment[],
): IConfigurationValidationIssue | undefined => {
	if (path.length === 0)
		return { path, message: 'edit path must not be empty' };
	for (const segment of path) {
		if (
			(typeof segment === 'string' &&
				(segment.length === 0 ||
					FORBIDDEN_PATH_SEGMENTS.has(segment))) ||
			(typeof segment === 'number' &&
				(!Number.isInteger(segment) || segment < 0))
		) {
			return { path, message: `invalid edit path: ${pathLabel(path)}` };
		}
	}
	return undefined;
};

const assertJsonValue = (value: unknown, seen = new Set<object>()): void => {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new Error('numbers must be finite');
		return;
	}
	if (typeof value !== 'object')
		throw new Error('value must be JSON-compatible');
	if (seen.has(value)) throw new Error('value must not contain cycles');
	seen.add(value);
	if (Array.isArray(value)) {
		for (const item of value) assertJsonValue(item, seen);
	} else {
		const prototype = Object.getPrototypeOf(value) as object | null;
		if (prototype !== Object.prototype && prototype !== null) {
			throw new Error('objects must use a plain JSON prototype');
		}
		for (const [key, item] of Object.entries(value)) {
			if (FORBIDDEN_PATH_SEGMENTS.has(key)) {
				throw new Error(`forbidden object key: ${key}`);
			}
			assertJsonValue(item, seen);
		}
	}
	seen.delete(value);
};

const secretIssueOf = (
	edit: ConfigurationEdit,
): IConfigurationValidationIssue | undefined => {
	if (edit.action === 'set') {
		const secretSegment = edit.path.find(
			(segment) =>
				typeof segment === 'string' && SECRET_FIELD.test(segment),
		);
		if (secretSegment !== undefined) {
			return {
				path: edit.path,
				message:
					'secret-valued fields cannot be persisted by the Configuration Center',
			};
		}
		const serialized = JSON.stringify(edit.value);
		if (redactSecrets(serialized).redactions > 0) {
			return {
				path: edit.path,
				message: 'the proposed value contains secret-like material',
			};
		}
	}
	return undefined;
};

const cloneConfig = (
	value: Readonly<Record<string, unknown>>,
): Record<string, unknown> =>
	JSON.parse(JSON.stringify(value)) as Record<string, unknown>;

const applyEdit = (
	root: Record<string, unknown>,
	edit: ConfigurationEdit,
): void => {
	let cursor: Record<string, unknown> | unknown[] = root;
	for (let index = 0; index < edit.path.length - 1; index += 1) {
		const segment = edit.path[index]!;
		const nextSegment = edit.path[index + 1]!;
		if (Array.isArray(cursor)) {
			if (typeof segment !== 'number' || segment > cursor.length) {
				throw new Error(
					`path does not address an array item: ${pathLabel(edit.path)}`,
				);
			}
			if (cursor[segment] === undefined && edit.action === 'delete')
				return;
			if (cursor[segment] === undefined) {
				cursor[segment] = typeof nextSegment === 'number' ? [] : {};
			}
			const next = cursor[segment];
			if (next === null || typeof next !== 'object') {
				throw new Error(
					`path crosses a scalar value: ${pathLabel(edit.path)}`,
				);
			}
			cursor = next as Record<string, unknown> | unknown[];
		} else {
			if (typeof segment !== 'string') {
				throw new Error(
					`path does not address an object key: ${pathLabel(edit.path)}`,
				);
			}
			if (cursor[segment] === undefined && edit.action === 'delete')
				return;
			if (cursor[segment] === undefined) {
				cursor[segment] = typeof nextSegment === 'number' ? [] : {};
			}
			const next = cursor[segment];
			if (next === null || typeof next !== 'object') {
				throw new Error(
					`path crosses a scalar value: ${pathLabel(edit.path)}`,
				);
			}
			cursor = next as Record<string, unknown> | unknown[];
		}
	}

	const leaf = edit.path.at(-1)!;
	if (Array.isArray(cursor)) {
		if (typeof leaf !== 'number' || leaf > cursor.length) {
			throw new Error(
				`path does not address an array item: ${pathLabel(edit.path)}`,
			);
		}
		if (edit.action === 'delete') {
			if (leaf < cursor.length) cursor.splice(leaf, 1);
		} else if (leaf === cursor.length) {
			cursor.push(edit.value);
		} else {
			cursor[leaf] = edit.value;
		}
		return;
	}
	if (typeof leaf !== 'string') {
		throw new Error(
			`path does not address an object key: ${pathLabel(edit.path)}`,
		);
	}
	if (edit.action === 'delete') delete cursor[leaf];
	else cursor[leaf] = edit.value;
};

const applyEdits = (
	value: Readonly<Record<string, unknown>>,
	edits: readonly ConfigurationEdit[],
):
	| { readonly ok: true; readonly value: Record<string, unknown> }
	| {
			readonly ok: false;
			readonly reason: 'validation' | 'secret';
			readonly issues: readonly IConfigurationValidationIssue[];
	  } => {
	const pathIssues = edits
		.map((edit) => validatePath(edit.path))
		.filter(
			(issue): issue is IConfigurationValidationIssue =>
				issue !== undefined,
		);
	if (pathIssues.length > 0) {
		return { ok: false, reason: 'validation', issues: pathIssues };
	}
	const jsonIssues: IConfigurationValidationIssue[] = [];
	for (const edit of edits) {
		if (edit.action !== 'set') continue;
		try {
			assertJsonValue(edit.value);
		} catch (error) {
			jsonIssues.push({
				path: edit.path,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}
	if (jsonIssues.length > 0) {
		return { ok: false, reason: 'validation', issues: jsonIssues };
	}
	const secretIssues = edits
		.map(secretIssueOf)
		.filter(
			(issue): issue is IConfigurationValidationIssue =>
				issue !== undefined,
		);
	if (secretIssues.length > 0) {
		return { ok: false, reason: 'secret', issues: secretIssues };
	}

	const next = cloneConfig(value);
	try {
		for (const edit of edits) {
			applyEdit(next, edit);
		}
	} catch (error) {
		return {
			ok: false,
			reason: 'validation',
			issues: [
				{
					path: [],
					message:
						error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
	return { ok: true, value: next };
};

export const readConfigurationDocument = async (
	input: IConfigurationDocumentInput,
): Promise<IConfigurationDocumentSnapshot> => {
	const configFile = configFileOf(input);
	return snapshotOf(configFile, await readDocument(configFile));
};

export const saveConfigurationDocument = async (
	input: ISaveConfigurationDocumentInput,
): Promise<SaveConfigurationDocumentResult> => {
	const configFile = configFileOf(input);
	return withFileMutex(configFile, async () => {
		const current = await readDocument(configFile);
		const currentSnapshot = snapshotOf(configFile, current);
		if (currentSnapshot.digest !== input.expectedDigest) {
			return {
				ok: false,
				reason: 'conflict',
				expectedDigest: input.expectedDigest,
				document: currentSnapshot,
			};
		}

		const edited = applyEdits(current.value, input.edits);
		if (!edited.ok) {
			return {
				ok: false,
				reason: edited.reason,
				issues: edited.issues,
				document: currentSnapshot,
			};
		}
		// The editor is forward-compatible at the root: unknown keys survive,
		// while every field the current core owns keeps canonical validation.
		const validated = CONFIG_FILE_SCHEMA.loose().safeParse(edited.value);
		if (!validated.success) {
			return {
				ok: false,
				reason: 'validation',
				issues: validated.error.issues.map((issue) => ({
					path: issue.path as readonly ConfigurationPathSegment[],
					message: issue.message,
				})),
				document: currentSnapshot,
			};
		}

		const changed =
			JSON.stringify(current.value) !== JSON.stringify(edited.value);
		if (!changed) {
			return { ok: true, changed: false, document: currentSnapshot };
		}
		const raw = `${JSON.stringify(edited.value, null, '\t')}\n`;
		await writeFileAtomic(configFile, raw);
		return {
			ok: true,
			changed: true,
			document: snapshotOf(configFile, {
				raw,
				exists: true,
				value: edited.value,
			}),
		};
	});
};
