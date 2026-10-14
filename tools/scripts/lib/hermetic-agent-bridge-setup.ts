/**
 * hermetic-agent-bridge-setup.ts — no test reads the machine's provider
 * model bridge, nor the identity of the agent running it.
 *
 * `agentFor` falls back to the model the chat provider published at
 * `~/.cache/delendai/provider-model.json`. On a machine where such a
 * provider is live, a spec that expects "nobody declared an agent" would
 * resolve one instead, and pass on every machine that is not running a
 * chat provider — the same machine-dependent observation
 * `hermetic-git-setup` exists to prevent. Pointing the bridge at a file
 * that does not exist makes every run see the same nothing. A spec that
 * tests the bridge points `DELENDAI_PROVIDER_MODEL_FILE` at its own
 * fixture.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	AGENT_ENVIRONMENT_MARKERS,
	AGENT_HOST_MARKER_PREFIXES,
	DELENDAI_SESSION_VARIABLE,
} from '../../../packages/core/src/lib/contracts/constants/agent-environment.constant';

// The agent that runs a suite is not the agent a spec is about: a spec
// that expects "no agent declared" resolved the reviewer's own id, and
// failed under every agent while CI (which sets none) stayed green. A
// spec that tests identity sets the variables it needs.
for (const name of Object.keys(process.env)) {
	if (
		AGENT_ENVIRONMENT_MARKERS.includes(name) ||
		name === DELENDAI_SESSION_VARIABLE ||
		AGENT_HOST_MARKER_PREFIXES.some((prefix) => name.startsWith(prefix))
	) {
		delete process.env[name];
	}
}

process.env.DELENDAI_PROVIDER_MODEL_FILE = join(
	tmpdir(),
	`delendai-no-provider-bridge-${process.pid}`,
);

// Neither the editors' chat sessions nor the models this machine was seen
// running may name the model a spec runs under.
process.env.DELENDAI_HOST_USER_DIRS = join(
	tmpdir(),
	`delendai-no-host-user-dirs-${process.pid}`,
);
process.env.DELENDAI_SEEN_MODELS_FILE = join(
	tmpdir(),
	`delendai-no-seen-models-${process.pid}.json`,
);

// A server a spec starts must not fetch or push the units of whatever
// repository it was started in.
process.env.DELENDAI_UNIT_FORGE_SYNC = 'off';
