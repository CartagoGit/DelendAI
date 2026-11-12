/**
 * hermetic-environment.helper.ts — a spec starts from an environment that
 * says nothing about the shell that runs it.
 *
 * Three work specs failed only because the agent running them had
 * `DELENDAI_SESSION_ID` exported: the session they resolved was the
 * runner's, not the one the spec entered. The setup cleared
 * `DELENDAI_SESSION` and every agent marker, and missed that one. The
 * rule is now the whole family: every delendai variable goes, except the
 * few that configure the runner, together with whatever names an agent.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	DELENDAI_VARIABLE_PREFIX,
	FORGE_CONFIG_DIR_VARIABLE,
	FORGE_TOKEN_VARIABLES,
	TEST_RUNNER_VARIABLE_PREFIXES,
} from '../contracts/constants/hermetic-environment.constant';
import type { IAmbientEnvironmentMarkers } from '../contracts/interfaces/hermetic-environment.interface';

const isAmbient = (
	name: string,
	markers: IAmbientEnvironmentMarkers,
): boolean =>
	(name.startsWith(DELENDAI_VARIABLE_PREFIX) &&
		!TEST_RUNNER_VARIABLE_PREFIXES.some((prefix) =>
			name.startsWith(prefix),
		)) ||
	FORGE_TOKEN_VARIABLES.includes(name) ||
	markers.names.includes(name) ||
	markers.prefixes.some((prefix) => name.startsWith(prefix));

let emptyForgeConfigDir: string | undefined;

/** An empty directory for `gh`'s login, made once a process. */
const forgeConfigDir = (): string => {
	emptyForgeConfigDir ??= mkdtempSync(join(tmpdir(), 'delendai-gh-'));
	return emptyForgeConfigDir;
};

/**
 * Remove from `env` every delendai variable but the runner's own, every
 * forge token and every variable `markers` names, and point `gh` at an
 * empty config directory so `gh auth token` finds no login. Returns the
 * names removed.
 */
export const clearAmbientEnvironment = (
	markers: IAmbientEnvironmentMarkers,
	env: NodeJS.ProcessEnv = process.env,
): readonly string[] => {
	const removed = Object.keys(env).filter((name) => isAmbient(name, markers));
	for (const name of removed) delete env[name];
	env[FORGE_CONFIG_DIR_VARIABLE] = forgeConfigDir();
	return removed;
};
