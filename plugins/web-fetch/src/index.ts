import { definePlugin } from '@mcp-vertex/core/public';

import { buildWebToolRegistrations } from './lib/tools/tools';

/**
 * Opt-in web/fetch plugin. npm package `@mcp-vertex/web-fetch` (the bare
 * name `@mcp-vertex/web` was already taken by the `apps/web` docs site
 * workspace) — the plugin's registered `name` is `web-fetch` too, since
 * `--plugins=<name>` resolves a bare specifier to `@mcp-vertex/<name>`
 * first (`resolvePluginSpecifier` in
 * `packages/core/src/lib/plugins/load-plugins.ts`); `--plugins=web` would
 * never find this package. `web_fetch` resolves one allow-listed URL and
 * returns its (capped) text body — the only tool in the swarm that reaches
 * outside the workspace, which is exactly why it is never part of a preset
 * (`PLUGIN_PRESETS` in `packages/core/src/lib/plugins/parse-cli-args.ts`
 * deliberately keeps opt-in capabilities like this one out of `minimal`/
 * `standard`/`swarm`, mirroring the precedent set by the `audit` plugin).
 * Load with `mcp-vertex --plugins=web-fetch` and configure the allow-list
 * via `plugins.web-fetch.options.allowList: string[]` — an empty/missing
 * allow-list means `web_fetch` rejects every call (fail closed, not open).
 */
export default definePlugin({
	name: 'web-fetch',
	version: '0.1.0',
	describe:
		'Opt-in web_fetch: resolve one allow-listed URL, return capped text. Network, fails closed without an allow-list.',
	register(ctx) {
		const o = ctx.options as { allowList?: unknown };
		const allowList = Array.isArray(o.allowList)
			? o.allowList.filter(
					(entry): entry is string => typeof entry === 'string',
				)
			: [];
		return {
			tools: buildWebToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				allowList,
			}),
			knowledge: [
				{
					id: 'web-usage',
					title: 'Web fetch (opt-in, network)',
					body: [
						'# Web fetch',
						'',
						`Tool: \`${ctx.namespacePrefix}_web_fetch { url, maxBytes?, timeoutMs? }\`.`,
						'',
						`- Allow-list: ${allowList.length > 0 ? allowList.join(', ') : '(none configured — every call is rejected)'}.`,
						'- The hostname of the URL (and of every redirect hop) must match the allow-list exactly or via a `*.suffix` wildcard.',
						'- Response body is capped (default 50 KiB); `truncated:true` signals the cap was hit, not a failure.',
						'- Opt-in by design: not part of any preset. Configure `plugins.web-fetch.options.allowList` in `mcp-vertex.config.json` to enable it.',
					].join('\n'),
				},
			],
		};
	},
	configExample: {
		summary:
			'Allow web_fetch to reach example.com and any subdomain of docs.example.com.',
		options: { allowList: ['example.com', '*.docs.example.com'] },
	},
});
