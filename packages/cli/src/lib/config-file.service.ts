import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
	CONFIG_FILE_SCHEMA,
	DEFAULT_CONFIG_FILENAME,
	diagnoseConfigFile,
	redactSecrets,
	resolveWorkspaceContained,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type { IConfigSetPlan } from '../contracts/interfaces/config-file.interface';

export const configPathFor = (workspace: string): string =>
	join(workspace, DEFAULT_CONFIG_FILENAME);

export const readConfigText = async (
	workspace: string,
): Promise<string | undefined> => {
	const path = configPathFor(workspace);
	if (!existsSync(path)) return undefined;
	return readFile(path, 'utf8');
};

const parseValue = (raw: string): unknown => {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
};

export const parseSetExpression = (expression: string): IConfigSetPlan => {
	const equals = expression.indexOf('=');
	if (equals < 1) throw new Error('expected <dot.path>=<json-value>');
	const path = expression
		.slice(0, equals)
		.split('.')
		.map((part) => part.trim())
		.filter(Boolean);
	if (path.length === 0) throw new Error('expected a non-empty dot path');
	return { path, value: parseValue(expression.slice(equals + 1)) };
};

export const getDotPath = (
	value: unknown,
	path: readonly string[],
): unknown => {
	let cursor = value;
	for (const part of path) {
		if (cursor === null || typeof cursor !== 'object') return undefined;
		cursor = (cursor as Record<string, unknown>)[part];
	}
	return cursor;
};

export const setDotPath = (
	value: Record<string, unknown>,
	path: readonly string[],
	next: unknown,
): Record<string, unknown> => {
	const root = structuredClone(value);
	let cursor: Record<string, unknown> = root;
	for (const part of path.slice(0, -1)) {
		const current = cursor[part];
		if (
			current === null ||
			typeof current !== 'object' ||
			Array.isArray(current)
		) {
			cursor[part] = {};
		}
		cursor = cursor[part] as Record<string, unknown>;
	}
	const leaf = path.at(-1);
	if (leaf === undefined) return root;
	cursor[leaf] = next;
	return root;
};

export const writeConfigSafely = async (
	workspace: string,
	value: Record<string, unknown>,
): Promise<string> => {
	const contained = resolveWorkspaceContained(
		workspace,
		DEFAULT_CONFIG_FILENAME,
	);
	if (!contained.ok)
		throw new Error(contained.reason ?? 'invalid config path');
	const target = contained.abs;
	const parsed = CONFIG_FILE_SCHEMA.safeParse(value);
	if (!parsed.success) {
		throw new Error(
			parsed.error.issues.map((issue) => issue.message).join('; '),
		);
	}
	const redacted = redactSecrets(JSON.stringify(parsed.data, null, 2));
	await withFileMutex(`${target}.lock`, async () => {
		await writeFileAtomic(target, `${redacted.text}\n`);
	});
	return target;
};

export const writeWorkspaceFileSafely = async (
	workspace: string,
	relativePath: string,
	content: string,
): Promise<string> => {
	const contained = resolveWorkspaceContained(workspace, relativePath);
	if (!contained.ok)
		throw new Error(contained.reason ?? 'invalid workspace path');
	const redacted = redactSecrets(content);
	await withFileMutex(`${contained.abs}.lock`, async () => {
		await writeFileAtomic(contained.abs, redacted.text);
	});
	return contained.abs;
};

export const diagnoseConfigText = (text: string | undefined) =>
	diagnoseConfigFile(text);
