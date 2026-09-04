import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import { buildLinkCheckRegistration } from './lib/tools/link-check.tool';

/**
 * Link-check plugin. `link_check` verifies markdown relative-link and anchor
 * integrity across the workspace — catching broken doc links before readers
 * (or the site build) do. Offline, read-only. Load with
 * `mcp-vertex --plugins=link-check`.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'link-check',
	version: '0.1.1',
	describe:
		'Docs integrity: link_check flags broken markdown relative links + missing heading anchors across the workspace. Offline (external links never fetched).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		return {
			tools: [
				buildLinkCheckRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
				}),
			],
			knowledge: [
				{
					id: 'link-check-usage',
					title: 'Markdown link + anchor integrity',
					body: [
						'# Markdown link + anchor integrity',
						'',
						`Tool: \`${ctx.namespacePrefix}_link_check\` — verify markdown links across the workspace (offline).`,
						'',
						'- `broken-link` (high): a relative link whose target file/dir does not exist.',
						'- `broken-anchor` (medium): a `#fragment` with no matching heading (GitHub slug rules).',
						'- `empty-link` (low): a `[text]()` with no target.',
						'- External links (http/mailto/…) are never fetched — the check is fully offline.',
						'- Skips node_modules, dist, build, .cache, .git. Great as a pre-publish docs gate.',
					].join('\n'),
				},
			],
		};
	},
});
