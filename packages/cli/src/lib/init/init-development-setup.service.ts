/**
 * init-development-setup.service.ts — the parts of `init` that follow the
 * project's development model instead of assuming one.
 *
 * `init` used to write a configuration and leave the model to be adopted
 * the first time a server started: a pull-request profile arrived with no
 * required check and refused to start, the guard hooks were never
 * installed, and the forge plugins were enabled in projects with no forge.
 * Each of those is a question the project's own facts answer, so they are
 * answered here, once, where the person who typed `init` can see it.
 */
import { resolve } from 'node:path';

import {
	adoptionFor,
	gatherAdoptionEvidence,
	type IAdoption,
} from '@delendai/core/cli';
import { parseJsonc } from '@delendai/core/cli';

import type { IInitGuardHooks } from '../../contracts/interfaces/init.interface';
import { isRecord } from '../helpers/cli-command.helper';
import { readConfigText } from '../config-file.service';
import { guardHooksMode } from '../guard-hooks-autoinstall.service';
import { installGuardHooks } from '../guard-hooks.service';

/** Plugins that only make sense next to a forge. */
const FORGE_PLUGINS_BY_KIND: Readonly<
	Record<'github' | 'gitlab', readonly string[]>
> = {
	github: ['forge', 'github', 'issues', 'issues-triage'],
	gitlab: ['forge', 'gitlab', 'issues', 'issues-triage'],
};
const ALL_FORGE_PLUGINS = [
	...new Set(Object.values(FORGE_PLUGINS_BY_KIND).flat()),
];

/**
 * The plugins the remote gives no use for. What the person asked for by
 * name is never taken away.
 */
export const forgePluginExclusions = (
	forge: IAdoption['forge'],
	requested: readonly string[],
): readonly string[] => {
	const wanted = new Set(
		forge === 'github' || forge === 'gitlab'
			? FORGE_PLUGINS_BY_KIND[forge]
			: [],
	);
	return ALL_FORGE_PLUGINS.filter(
		(plugin) => !wanted.has(plugin) && !requested.includes(plugin),
	);
};

/**
 * The development block a fresh project should be given, or `undefined`
 * when it already declares one (which is never rewritten).
 */
export const adoptDevelopmentForInit = async (
	workspaceRoot: string,
	gatherEvidence?: Parameters<typeof adoptionFor>[2],
): Promise<IAdoption | undefined> => {
	const text = await readConfigText(workspaceRoot);
	if (text !== undefined) {
		const parsed = parseJsonc(text);
		if (isRecord(parsed.value) && parsed.value.development !== undefined) {
			return undefined;
		}
	}
	try {
		// Init declares a model on the person's behalf, so it is the one
		// caller that reads the forge.
		return await adoptionFor(
			workspaceRoot,
			{},
			gatherEvidence ?? gatherAdoptionEvidence,
		);
	} catch {
		return undefined;
	}
};

/**
 * Install the hooks that enforce the policy. `init` is a command someone
 * typed, so writing to `.git/hooks` is what was asked for — unlike
 * starting a server, which never writes. A project that says
 * `development.guardHooks: "off"` keeps its hooks untouched.
 */
export const installGuardHooksForInit = async (
	workspaceRoot: string,
): Promise<IInitGuardHooks> => {
	if ((await guardHooksMode(workspaceRoot)) === 'off') {
		return {
			state: 'skipped',
			reason: '`development.guardHooks` is "off" in delendai.config.json',
		};
	}
	try {
		return {
			state: 'installed',
			report: installGuardHooks(workspaceRoot, {
				runner: process.execPath,
				entry: resolve(process.argv[1] ?? ''),
			}),
		};
	} catch (error) {
		return {
			state: 'skipped',
			reason: `the hooks could not be installed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
};
