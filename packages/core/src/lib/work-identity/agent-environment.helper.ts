/**
 * agent-environment.helper.ts — whether an agent is driving this process.
 */
import {
	AGENT_ENVIRONMENT_MARKERS,
	AGENT_HOST_MARKERS,
	AGENT_HOST_MARKER_PREFIXES,
	CROSS_RUNTIME_AGENT_MARKER,
} from '../contracts/constants/agent-environment.constant';
import { KNOWN_CLIENTS } from '../contracts/constants/known-clients.constant';

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

/**
 * A client's profile variable (`CODEX_HOME`) shares a host's prefix, but a
 * person may export it in their own shell: it says where a client keeps
 * its files, not that the client is running this process.
 */
const PROFILE_VARIABLES: ReadonlySet<string> = new Set(
	KNOWN_CLIENTS.flatMap((client) =>
		client.profileVariable === undefined ? [] : [client.profileVariable],
	),
);

/**
 * The variable showing that an agent HOST drives this process (Claude
 * Code, Codex, Gemini CLI, opencode, Cursor), or `undefined`. Neither the
 * cross-runtime convention nor a profile variable counts: neither says
 * which host is running. Such a host knows its own model, so nothing
 * observed for a chat conversation names the agent it runs.
 */
export const agentHostMarker = (env: IEnvironment): string | undefined =>
	AGENT_HOST_MARKERS.filter(
		(name) => name !== CROSS_RUNTIME_AGENT_MARKER,
	).find((name) => isSet(env, name)) ??
	Object.keys(env)
		.filter(
			(name) =>
				!PROFILE_VARIABLES.has(name) &&
				AGENT_HOST_MARKER_PREFIXES.some((prefix) =>
					name.startsWith(prefix),
				),
		)
		.sort()
		.find((name) => isSet(env, name));
