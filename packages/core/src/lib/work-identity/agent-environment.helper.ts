/**
 * agent-environment.helper.ts — whether an agent is driving this process.
 */
import {
	AGENT_ENVIRONMENT_MARKERS,
	AGENT_HOST_MARKER_PREFIXES,
} from '../contracts/constants/agent-environment.constant';

type IEnvironment = Readonly<Record<string, string | undefined>>;

const isSet = (env: IEnvironment, name: string): boolean =>
	(env[name] ?? '').trim().length > 0;

/** Whether `name` is a variable only an agent host exports. */
export const isAgentEnvironmentVariable = (name: string): boolean =>
	AGENT_ENVIRONMENT_MARKERS.includes(name) ||
	AGENT_HOST_MARKER_PREFIXES.some((prefix) => name.startsWith(prefix));

/**
 * The first agent marker set in `env`, or `undefined` when none is. A
 * blank value does not count: an exported-but-empty variable declares
 * nothing.
 */
export const agentEnvironmentMarker = (env: IEnvironment): string | undefined =>
	AGENT_ENVIRONMENT_MARKERS.find((name) => isSet(env, name)) ??
	Object.keys(env)
		.filter((name) =>
			AGENT_HOST_MARKER_PREFIXES.some((prefix) =>
				name.startsWith(prefix),
			),
		)
		.sort()
		.find((name) => isSet(env, name));
