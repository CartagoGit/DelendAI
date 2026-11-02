/**
 * declared-hosts.helper.ts — the `hosts` a project's delendai.config.json
 * declares, read where no parsed configuration is at hand.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseJsonc } from '../config/jsonc-document';

/** The declared host ids, or undefined when the configuration names none. */
export const readDeclaredHosts = async (
	root: string,
): Promise<readonly string[] | undefined> => {
	const text = await readFile(
		join(root, 'delendai.config.json'),
		'utf8',
	).catch(() => undefined);
	if (text === undefined) return undefined;
	const value = parseJsonc(text).value;
	if (typeof value !== 'object' || value === null) return undefined;
	const hosts = (value as { readonly hosts?: unknown }).hosts;
	return Array.isArray(hosts) &&
		hosts.every((host): host is string => typeof host === 'string')
		? hosts
		: undefined;
};
