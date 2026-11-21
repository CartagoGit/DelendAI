/**
 * command-args.helper.ts — reading the flags a unit-of-work operation is
 * given, the same way whether a CLI command or an MCP tool passes them.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DEFAULT_CONFIG_FILENAME } from '../plugins/load-config-file';

export { isRecord } from '../shared/is-record';

/**
 * Read a `--name=value` (inline) or `--name value` (spaced) scalar flag.
 * Returns `undefined` when the flag is absent.
 */
export const scalarArg = (
	args: readonly string[],
	name: string,
): string | undefined => {
	const inline = args.find((arg) => arg.startsWith(`--${name}=`));
	if (inline !== undefined) return inline.slice(name.length + 3);
	const index = args.indexOf(`--${name}`);
	return index >= 0 ? args[index + 1] : undefined;
};

/** Where a workspace's configuration file is. */
export const configPathFor = (workspace: string): string =>
	join(workspace, DEFAULT_CONFIG_FILENAME);

/** The workspace's configuration file as text, or `undefined` without one. */
export const readConfigText = async (
	workspace: string,
): Promise<string | undefined> => {
	try {
		return await readFile(configPathFor(workspace), 'utf8');
	} catch {
		return undefined;
	}
};
