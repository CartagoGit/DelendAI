# Local replay commands

All Git reads use snapshot bec5d5daf945df78464e4535c47628809ef8ca64 and DELENDAI_AGENT_ID=gpt-6.1-sol. All mutations are under /tmp.

- `python3 usage/read.py production 650` repeatedly until all source read (read-01..read-09 logs).
- `python3 usage/read.py metadata 650` (metadata read log).
- `python3 usage/read-selected.py <explicit test paths>` (selected-read logs).
- `python3 usage/prepare-snapshot.py` from repository cwd extracts fixed git archive into usage/snapshot; installed dependencies are linked read-only from shared node_modules.
- `bun usage/probe.ts > usage/probe-output.log 2>&1` (production helper probes; no network/provider).
- `node <HOME>/_projects/delendai/node_modules/vitest/vitest.mjs run --config usage/snapshot/usage-audit.vitest.ts --reporter=verbose > usage/tests-output.log 2>&1` (9 specs / 68 pass).
- `bun usage/surface.ts > usage/surface-output.log 2>&1` (real MCP SDK in-memory list and report; final confirm:false call deliberately reveals raw builder output-schema rejection, without core normalization).

The first surface script exits via the captured SDK exception after measuring definitions and normal/compact reports; shell output previously ended with cat, so do not treat its shell exit status as proof of full success. The SDK is the installed @modelcontextprotocol/sdk1.32.1; plugin and local package sources are pinned via extracted Git snapshot. No network host was started and no credentials/provider were used.
