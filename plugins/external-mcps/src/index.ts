/**
 * external-mcps — compose third-party MCP servers under the host (f00068).
 *
 * S1 ships the pure core of the plugin: the `servers` config contract
 * (mandatory version pins, kebab ids, env var NAMES only, the three
 * autonomy knobs) plus the two offline tools — `catalog` (the only
 * discovery surface for the curated + discoverable seed tiers) and
 * `validate_config` (schema dry-run, never writes). S2 adds the lazy
 * subprocess registry (`status` + the `call` invoke proxy — declared
 * servers boot on first call, `eager: true` boots at init). Suggest/ack
 * and gated live discovery land in S3–S5.
 *
 * Token-lean mandate (gate decisions 1 + 6): the plugin contributes NO
 * knowledge entries and NO skills — zero system-prompt bytes beyond the
 * two tool one-liners. A session that never composes an external server
 * pays nothing; discovery is one compact `catalog` call away.
 */
import { definePlugin, joinRel } from '@mcp-vertex/core/public';

import {
	detectCatalogIds,
	loadDetectEvidence,
} from './lib/detect/detect-rules';
import { OptionsSchema, ServerEntrySchema } from './lib/options-schema';
import { createPendingAcksStore } from './lib/ack/pending-acks';
import {
	ExternalServerRegistry,
	type IRegistryServerEntry,
} from './lib/subprocess/server-registry';
import { buildAckToolRegistration } from './lib/tools/ack.tool';
import { buildCatalogToolRegistration } from './lib/tools/catalog.tool';
import { buildDiscoverToolRegistration } from './lib/tools/discover.tool';
import { buildCallToolRegistration } from './lib/tools/invoke-proxy';
import { buildStatusToolRegistration } from './lib/tools/status.tool';
import { buildSuggestToolRegistration } from './lib/tools/suggest.tool';
import { buildValidateConfigToolRegistration } from './lib/tools/validate-config.tool';

export default definePlugin({
	name: 'external-mcps',
	version: '0.1.1',
	describe:
		'Compose third-party MCP servers under the host: seed-catalog discovery, config dry-run validation, and lazy subprocess boot behind the ext.<server>.<tool> call proxy; human-acked activation lands in S3.',
	optionsSchema: OptionsSchema,
	configExample: {
		summary:
			'Declare a disabled, exactly pinned external MCP and enable it only after reviewing its command and environment-variable names.',
		options: {
			servers: {
				'example-server': {
					enabled: false,
					version: '1.2.3',
					command: 'npx',
					args: ['-y', '@example/mcp-server@1.2.3'],
					env: ['EXAMPLE_API_TOKEN'],
				},
			},
			llmDecidesActivation: true,
			requireHumanAckWhenLlmDecides: true,
			allowDiscoverySearch: false,
		},
	},
	register(ctx) {
		// The loader already validated ctx.options against OptionsSchema;
		// re-parse to apply the knob defaults (safeParse keeps a hand-built
		// test context with unknown keys from crashing registration).
		const parsed = OptionsSchema.safeParse(ctx.options);
		const options = parsed.success ? parsed.data : OptionsSchema.parse({});
		const enabledServers = Object.fromEntries(
			Object.entries(options.servers ?? {}).filter(
				([, entry]) => entry.enabled !== false,
			),
		);
		const registry = new ExternalServerRegistry({
			servers: enabledServers as Readonly<
				Record<string, IRegistryServerEntry>
			>,
			// Invariant: workspace comes from the context, never process.cwd().
			workspaceRoot: ctx.workspace.root,
		});
		// Lazy is the default; `eager: true` entries opt out and boot now.
		registry.bootEager();
		// Detection ANNOTATES catalog/suggest output (`detected: true`) — it
		// never activates a server (S4). Evidence (the workspace package.json)
		// is read lazily on first use and memoised; the workspace root comes
		// from the context, never process.cwd().
		// x00097 S1: ONE durable pending-acks ledger backs both sides of the
		// activation gate — the `ack` tool writes it, the `call` proxy reads
		// it (same path, same file mutex). Accepting an ack therefore enables
		// the call with defaults; without this composition the proxy's
		// fail-closed default refused every call forever.
		const pendingAcksPath = ctx.workspace.resolve(
			joinRel(ctx.pluginCacheDir, 'pending-acks.json'),
		);
		const ackStore = createPendingAcksStore(pendingAcksPath);
		let detectedCache: ReadonlySet<string> | undefined;
		const detect = async (): Promise<ReadonlySet<string>> => {
			if (detectedCache === undefined) {
				const evidence = await loadDetectEvidence(ctx.workspace.root);
				detectedCache = detectCatalogIds(evidence);
			}
			return detectedCache;
		};
		return {
			// AUD-D05: `registrations` wraps the plugin's usual surface so
			// this return value is recognised as an `IPluginRuntime` (the
			// loader's `normalizePluginRuntimeInternal` keys off the
			// presence of a `registrations` property) — a flat object with a
			// bare `dispose` alongside `tools`/`activation` would be silently
			// treated as plain registrations and lose `dispose` exactly like
			// AUD-E01.c. The servers this plugin boots are third-party MCP
			// subprocesses with their own sockets/fds; `ExternalServerRegistry`
			// already knows how to close every one of them (`closeAll`, itself
			// idempotent) — the only thing missing was a `dispose` for the
			// host to call it through.
			registrations: {
				activation: Object.keys(options.servers ?? {})
					.sort()
					.map((id) => ({
						id: `ext.${id}`,
						origin: 'external' as const,
						source: 'config' as const,
						active: options.servers?.[id]?.enabled !== false,
						// Child tools stay behind one shared `call` proxy, so each
						// declared server adds zero direct tools to the host prompt.
						toolCount: 0,
						configuration: {
							options: options.servers?.[id] ?? {},
							optionsSchema: ServerEntrySchema,
							configExample: options.servers?.[id] ?? {},
						},
					})),
				tools: [
					buildCatalogToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						detect,
					}),
					buildValidateConfigToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
					}),
					buildDiscoverToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						allowDiscoverySearch: options.allowDiscoverySearch,
					}),
					buildSuggestToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						options: ctx.options,
						detect,
					}),
					buildAckToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						pendingAcksPath,
					}),
					buildStatusToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						registry,
					}),
					buildCallToolRegistration({
						namespacePrefix: ctx.namespacePrefix,
						registry,
						llmDecidesActivation: options.llmDecidesActivation,
						requireHumanAckWhenLlmDecides:
							options.requireHumanAckWhenLlmDecides,
						hasRecordedAck: (serverId) =>
							ackStore.isAcked(serverId),
					}),
				],
			},
			dispose: async () => registry.closeAll(),
		};
	},
});
