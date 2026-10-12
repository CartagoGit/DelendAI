/**
 * hermetic-agent-bridge-setup.ts — no test reads the machine's provider
 * model bridge.
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

process.env.DELENDAI_PROVIDER_MODEL_FILE = join(
	tmpdir(),
	`delendai-no-provider-bridge-${process.pid}`,
);
