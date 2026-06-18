/**
 * Example mcp-vertex plugin: `wordcount`.
 *
 * The whole plugin contract in one readable file — copy this folder to start
 * your own plugin. A real plugin usually splits the engine/tools into `lib/`,
 * but everything here is deliberately inline so you can see the shape:
 *
 *   1. `optionsSchema` (zod) → declarative validation of `plugins.<name>.options`
 *      from `mcp-vertex.config.json`. The loader rejects bad options BEFORE
 *      `register` runs, and `mcp-vertex --check` reports them.
 *   2. a tool (`IToolRegistration`) with `inputSchema` + `outputSchema` (zod) and
 *      a handler that returns a compact `toolJson` payload (also surfaced as
 *      MCP `structuredContent`).
 *   3. a `knowledge` entry — lazy, on-demand context for the agent.
 *
 * Run it:  `mcp-vertex --plugins=@mcp-vertex/example-wordcount`
 * (or point your client's `mcp.json` at the core bin with that `--plugins`).
 */
import { z } from 'zod';

import { definePlugin, toolJson } from '@mcp-vertex/core/public';
import type { IToolRegistration } from '@mcp-vertex/core/public';

/** Options for this plugin, read from `plugins.example-wordcount.options`. */
export const OptionsSchema = z.object({
	/** Treat punctuation as a word boundary too (default true). */
	splitOnPunctuation: z.boolean().optional(),
});

const buildWordcountTool = (
	namespacePrefix: string,
	splitOnPunctuation: boolean
): IToolRegistration => ({
	id: 'wordcount',
	summary: 'Count the words and characters in a piece of text.',
	tags: ['example'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_wordcount`,
			{
				description:
					'Count the words and characters in `text`. Pure, no I/O. (Example plugin showing the mcp-vertex contract.)',
				inputSchema: z.object({ text: z.string() }),
				outputSchema: z.object({
					words: z.number(),
					chars: z.number(),
				}),
			},
			async (args: { text: string }) => {
				const separator = splitOnPunctuation ? /[\s\p{P}]+/u : /\s+/;
				const words = args.text.split(separator).filter(Boolean).length;
				return toolJson({ words, chars: args.text.length });
			}
		);
	},
});

export default definePlugin({
	name: 'example-wordcount',
	version: '0.1.0',
	describe: 'Example: count words/characters in text (a single `wordcount` tool).',
	optionsSchema: OptionsSchema,
	register(ctx) {
		// ctx.options is already shaped by OptionsSchema (validated by the loader).
		const { splitOnPunctuation = true } = OptionsSchema.parse(ctx.options);

		return {
			tools: [buildWordcountTool(ctx.namespacePrefix, splitOnPunctuation)],
			knowledge: [
				{
					id: 'example-wordcount',
					title: 'Example wordcount plugin',
					body: [
						'# Example: wordcount',
						'',
						`Tool: \`${ctx.namespacePrefix}_wordcount\` — returns \`{ words, chars }\` for the given \`text\`.`,
						'',
						'This plugin is a minimal, copy-pasteable template for authoring your own.',
					].join('\n'),
				},
			],
		};
	},
});
