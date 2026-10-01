/**
 * agent-environment.helper.ts — whether an agent is driving this process.
 */
import { AGENT_ENVIRONMENT_MARKERS } from '../contracts/constants/agent-environment.constant';

/**
 * The first agent marker set in `env`, or `undefined` for a person's
 * shell. A blank value does not count: an exported-but-empty variable
 * declares nothing.
 */
export const agentEnvironmentMarker = (
	env: Readonly<Record<string, string | undefined>>,
): string | undefined =>
	AGENT_ENVIRONMENT_MARKERS.find(
		(name) => (env[name] ?? '').trim().length > 0,
	);
