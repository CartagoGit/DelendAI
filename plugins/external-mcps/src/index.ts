/**
 * external-mcps — compose third-party MCP servers under the host (f00068).
 *
 * S1 ships the pure core of the plugin: the `servers` config contract
 * (mandatory version pins, kebab ids, env var NAMES only, the three
 * autonomy knobs) plus the two offline tools — `catalog` (the only
 * discovery surface for the curated + discoverable seed tiers) and
 * `validate_config` (schema dry-run, never writes). Lazy subprocess
 * boot, suggest/ack and gated live discovery land in S2–S5.
 *
 * Token-lean mandate (gate decisions 1 + 6): the plugin contributes NO
 * knowledge entries and NO skills — zero system-prompt bytes beyond the
 * two tool one-liners. A session that never composes an external server
 * pays nothing; discovery is one compact `catalog` call away.
 */
import { definePlugin } from '@mcp-vertex/core/public';

import { OptionsSchema } from './lib/options-schema';
import { buildCatalogToolRegistration } from './lib/tools/catalog.tool';
import { buildValidateConfigToolRegistration } from './lib/tools/validate-config.tool';

export default definePlugin({
	name: 'external-mcps',
	version: '0.1.0',
	describe:
		'Compose third-party MCP servers under the host: seed-catalog discovery and config dry-run validation now; lazy subprocess boot with human-acked activation in later slices.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildCatalogToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
				}),
				buildValidateConfigToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
				}),
			],
		};
	},
});
