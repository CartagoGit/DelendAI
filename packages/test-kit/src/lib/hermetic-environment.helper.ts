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
import {
	DELENDAI_VARIABLE_PREFIX,
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
	markers.names.includes(name) ||
	markers.prefixes.some((prefix) => name.startsWith(prefix));

/**
 * Remove from `env` every delendai variable but the runner's own, and
 * every variable `markers` names. Returns the names removed.
 */
export const clearAmbientEnvironment = (
	markers: IAmbientEnvironmentMarkers,
	env: NodeJS.ProcessEnv = process.env,
): readonly string[] => {
	const removed = Object.keys(env).filter((name) => isAmbient(name, markers));
	for (const name of removed) delete env[name];
	return removed;
};
