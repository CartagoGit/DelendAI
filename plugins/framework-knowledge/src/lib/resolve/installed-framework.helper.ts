// installed-framework.helper.ts — which framework, at which version.
//
// Detection and version resolution are core's (`matchFramework`,
// `resolveFrameworkVersion`); this only reads the two files they need
// and joins the answers, so both tools resolve identically.

import {
	DEFAULT_FRAMEWORK_RULES,
	matchFramework,
	resolveFrameworkVersion,
	SafeWorkspaceReader,
} from '@delendai/core/public';
import type { ILockfileRef } from '@delendai/core/public';

import { LOCKFILE_NAMES } from '../contracts/constants/knowledge-cache.constant';
import type { IInstalledFramework } from '../contracts/interfaces/knowledge-cache.interface';

const readTextIfPresent = async (
	rootAbs: string,
	name: string,
): Promise<string | undefined> => {
	try {
		return (await new SafeWorkspaceReader(rootAbs).readText(name)).content;
	} catch {
		return undefined;
	}
};

const readDependencies = async (
	rootAbs: string,
): Promise<Readonly<Record<string, string>>> => {
	const text = await readTextIfPresent(rootAbs, 'package.json');
	if (text === undefined) return {};
	try {
		const manifest = JSON.parse(text) as {
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		return { ...manifest.devDependencies, ...manifest.dependencies };
	} catch {
		return {};
	}
};

const readLockfile = async (
	rootAbs: string,
): Promise<ILockfileRef | undefined> => {
	for (const name of LOCKFILE_NAMES) {
		const text = await readTextIfPresent(rootAbs, name);
		if (text !== undefined) {
			return { kind: name, text };
		}
	}
	return undefined;
};

/**
 * Resolve the framework the project depends on and its installed
 * version. `requestedFramework` narrows detection to one framework id
 * for a monorepo that mixes several; `undefined` is returned when the
 * project has no known framework dependency at all.
 */
export const resolveInstalledFramework = async (
	rootAbs: string,
	requestedFramework?: string,
): Promise<IInstalledFramework | undefined> => {
	const deps = await readDependencies(rootAbs);
	const rules =
		requestedFramework === undefined
			? DEFAULT_FRAMEWORK_RULES
			: DEFAULT_FRAMEWORK_RULES.filter(
					(rule) => rule.id === requestedFramework,
				);
	const frameworkId = matchFramework(deps, rules);
	const rule = DEFAULT_FRAMEWORK_RULES.find((r) => r.id === frameworkId);
	if (frameworkId === undefined || rule === undefined) return undefined;
	const resolved = resolveFrameworkVersion(
		rule.depName,
		deps[rule.depName],
		await readLockfile(rootAbs),
	);
	return {
		frameworkId,
		depName: rule.depName,
		version: resolved.version,
		lockEntry:
			resolved.version === undefined
				? undefined
				: `${resolved.source}:${rule.depName}@${resolved.version}`,
	};
};
