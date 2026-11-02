// effect-boundary-authorized: read-only discovery of workspace package manifests for release_plan; no writes, no process spawn.
// permissions-declared-authorized: reads only the workspace's own package.json files under the configured root.
/**
 * Derives the publish order from the workspace itself, so `release_plan`
 * works without a hand-injected snapshot: every non-private workspace
 * package, sorted by directory.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { IPublishOrderEntry } from './release-plan.tool';

const readJson = async (path: string): Promise<unknown> => {
	try {
		return JSON.parse(await readFile(path, 'utf8')) as unknown;
	} catch {
		return undefined;
	}
};

const workspaceGlobs = (manifest: unknown): readonly string[] => {
	const workspaces = (manifest as { workspaces?: unknown } | undefined)
		?.workspaces;
	const list = Array.isArray(workspaces)
		? workspaces
		: (workspaces as { packages?: unknown } | undefined)?.packages;
	return Array.isArray(list)
		? list.filter((g): g is string => typeof g === 'string')
		: [];
};

const expandGlob = async (
	rootAbs: string,
	glob: string,
): Promise<readonly string[]> => {
	if (!glob.endsWith('/*')) return [glob];
	const base = glob.slice(0, -2);
	try {
		const entries = await readdir(join(rootAbs, base), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => `${base}/${entry.name}`);
	} catch {
		return [];
	}
};

export const discoverPublishOrder = async (
	rootAbs: string,
): Promise<readonly IPublishOrderEntry[]> => {
	const dirs = (
		await Promise.all(
			workspaceGlobs(await readJson(join(rootAbs, 'package.json'))).map(
				(glob) => expandGlob(rootAbs, glob),
			),
		)
	).flat();
	const found: IPublishOrderEntry[] = [];
	for (const dir of [...new Set(dirs)].sort()) {
		const pkg = (await readJson(join(rootAbs, dir, 'package.json'))) as
			| { name?: unknown; version?: unknown; private?: unknown }
			| undefined;
		if (
			typeof pkg?.name === 'string' &&
			typeof pkg.version === 'string' &&
			pkg.private !== true
		) {
			found.push({ dir, name: pkg.name, version: pkg.version });
		}
	}
	return found;
};
