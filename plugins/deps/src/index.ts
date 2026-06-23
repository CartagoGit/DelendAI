import { definePlugin } from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildDepsToolRegistrations } from './lib/tools';
import { buildDepsWriteToolRegistrations } from './lib/tools/write-tools';

/**
 * Dependency inventory + offline health plugin. `deps_list` enumerates the
 * manifest's declared dependencies; `deps_check` flags a missing lockfile,
 * unpinned version ranges and cross-section duplicates — all offline,
 * agnostic, no network/CVE database. Load with `mcp-vertex --plugins=deps`.
 * Configure the manifest path via `plugins.deps.options.manifest`. Set
 * `plugins.deps.options.allowNetwork: true` to also expose `deps_outdated`
 * (the one declared exception to "offline by design": it queries npm). Set
 * `plugins.deps.options.allowWrite: true` to also expose `package_install` /
 * `package_run_script` (mutates package.json/the lockfile and may spawn).
 */

/**
 * r00003 S9 (F6, O + L + I): explicit zod schema for the deps plugin's
 * options. Replaces the `ctx.options as { … }` cast so a host misconfig
 * (e.g. `allowNetwork: "yes"`) is rejected up front.
 */
const OptionsSchema = z.object({
	manifest: z.string().optional(),
	allowNetwork: z.boolean().optional(),
	allowWrite: z.boolean().optional(),
});

export default definePlugin({
	name: 'deps',
	version: '0.1.0',
	describe:
		'Dependency inventory + offline health (deps_list / deps_check): lockfile, unpinned ranges, duplicates. Opt-in deps_outdated (network) and package_install/package_run_script (write).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			throw new Error(
				`deps plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const o = parsed.data;
		return {
			tools: [
				...buildDepsToolRegistrations({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
					...(typeof o.manifest === 'string'
						? { manifest: o.manifest }
						: {}),
					...(o.allowNetwork === true ? { allowNetwork: true } : {}),
				}),
				...(o.allowWrite === true
					? buildDepsWriteToolRegistrations({
							namespacePrefix: ctx.namespacePrefix,
							workspaceRootAbs: ctx.workspace.root,
						})
					: []),
			],
			knowledge: [
				{
					id: 'deps-usage',
					title: 'Dependency health',
					body: [
						'# Dependency health',
						'',
						`Tools: \`${ctx.namespacePrefix}_deps_list\` (inventory) / \`${ctx.namespacePrefix}_deps_check\` (offline health) / \`${ctx.namespacePrefix}_deps_polyglot\` (Python/Rust/Go)${o.allowNetwork === true ? ` / \`${ctx.namespacePrefix}_deps_outdated\` (network)` : ''}${o.allowWrite === true ? ` / \`${ctx.namespacePrefix}_package_install\` / \`${ctx.namespacePrefix}_package_run_script\` (write)` : ''}.`,
						'',
						'- `deps_list` enumerates package.json deps (with version ranges) per section.',
						'- `deps_check` flags: no lockfile (non-reproducible builds), unpinned ranges (`*`/`latest`), and deps in more than one section.',
						'- `deps_polyglot` lists pyproject.toml/Cargo.toml/go.mod deps when those manifests exist — npm-agnostic, still offline.',
						'- Offline and agnostic by default: no network, no CVE database. For vulnerability scanning use a dedicated external tool.',
						"- `deps_outdated` (opt-in via `allowNetwork: true`) resolves each dep's latest npm version and flags stale ones — the one declared `effects: ['network']` exception.",
						"- `package_install`/`package_run_script` (opt-in via `allowWrite: true`) mutate package.json/the lockfile and may spawn — the one declared `effects: ['write','spawn']` exception.",
					].join('\n'),
				},
			],
		};
	},
});
