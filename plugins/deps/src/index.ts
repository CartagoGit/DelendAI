import { definePlugin } from '@mcp-vertex/core/public';

import { buildDepsToolRegistrations } from './lib/tools';

/**
 * Dependency inventory + offline health plugin. `deps_list` enumerates the
 * manifest's declared dependencies; `deps_check` flags a missing lockfile,
 * unpinned version ranges and cross-section duplicates — all offline,
 * agnostic, no network/CVE database. Load with `mcp-vertex --plugins=deps`.
 * Configure the manifest path via `plugins.deps.options.manifest`. Set
 * `plugins.deps.options.allowNetwork: true` to also expose `deps_outdated`
 * (the one declared exception to "offline by design": it queries npm).
 */
export default definePlugin({
	name: 'deps',
	version: '0.1.0',
	describe:
		'Dependency inventory + offline health (deps_list / deps_check): lockfile, unpinned ranges, duplicates. Opt-in deps_outdated (network).',
	register(ctx) {
		const o = ctx.options as { manifest?: string; allowNetwork?: boolean };
		return {
			tools: buildDepsToolRegistrations({
				namespacePrefix: ctx.namespacePrefix,
				workspaceRootAbs: ctx.workspace.root,
				...(typeof o.manifest === 'string'
					? { manifest: o.manifest }
					: {}),
				...(o.allowNetwork === true ? { allowNetwork: true } : {}),
			}),
			knowledge: [
				{
					id: 'deps-usage',
					title: 'Dependency health',
					body: [
						'# Dependency health',
						'',
						`Tools: \`${ctx.namespacePrefix}_deps_list\` (inventory) / \`${ctx.namespacePrefix}_deps_check\` (offline health)${o.allowNetwork === true ? ` / \`${ctx.namespacePrefix}_deps_outdated\` (network)` : ''}.`,
						'',
						'- `deps_list` enumerates package.json deps (with version ranges) per section.',
						'- `deps_check` flags: no lockfile (non-reproducible builds), unpinned ranges (`*`/`latest`), and deps in more than one section.',
						'- Offline and agnostic by default: no network, no CVE database. For vulnerability scanning use a dedicated external tool.',
						"- `deps_outdated` (opt-in via `allowNetwork: true`) resolves each dep's latest npm version and flags stale ones — the one declared `effects: ['network']` exception.",
					].join('\n'),
				},
			],
		};
	},
});
