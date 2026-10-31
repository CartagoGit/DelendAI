/**
 * hermetic-agent-identity-setup.ts — no test reads the identity of the
 * agent running it.
 *
 * The agent that runs a suite is not the agent a spec is about: a spec
 * that expects "no agent declared" resolved the reviewer's own id, and
 * failed under every agent while CI, which sets none, stayed green. Every
 * marker is cleared before the specs run; a spec that tests identity sets
 * the variables it needs.
 */
import {
	AGENT_ENVIRONMENT_MARKERS,
	AGENT_HOST_MARKER_PREFIXES,
	DELENDAI_SESSION_VARIABLE,
} from '../../../packages/core/src/lib/contracts/constants/agent-environment.constant';

for (const name of Object.keys(process.env)) {
	if (
		AGENT_ENVIRONMENT_MARKERS.includes(name) ||
		name === DELENDAI_SESSION_VARIABLE ||
		AGENT_HOST_MARKER_PREFIXES.some((prefix) => name.startsWith(prefix))
	) {
		delete process.env[name];
	}
}
