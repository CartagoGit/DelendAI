import {
	createWorkspaceFileReader,
	definePlugin,
	joinRel,
} from '@mcp-vertex/core/public';
import { z } from 'zod';

import { buildApplyingRulesKnowledge } from './lib/knowledge/applying-rules';
import { buildRulesManifest, ensureRulesCache } from './lib/frameworks/manifest';
import { PRESET_BY_ID } from './lib/frameworks/presets';
import type { IRulesMode } from './lib/frameworks/types';
import { RULES_MODES } from './lib/frameworks/types';
import {
	buildApplyRulesRegistration,
	buildCheckRulesRegistration,
	buildGetRulesRegistration,
} from './lib/tools/rules-tools';
import type { IRulesToolOptions } from './lib/tools/rules-tools';


const projectNameFrom = (
	reader: { readFile(p: string): string | undefined },
	root: string
): string => {
	const raw = reader.readFile('package.json');
	if (raw !== undefined) {
		try {
			const name = (JSON.parse(raw) as { name?: string }).name;
			if (typeof name === 'string' && name.length > 0) {
				return name.replace(/^@[^/]+\//, '');
			}
		} catch {
			// fall through
		}
	}
	const base = root.replace(/\/+$/, '').split('/').pop();
	return base && base.length > 0 ? base : 'project';
};

const presetIdFor = (
	framework: string | undefined,
	language: string | undefined
): string | undefined => {
	if (framework === undefined) return undefined;
	const ts = language !== 'js';
	switch (framework) {
		case 'angular':
			return 'angular';
		case 'react':
			return ts ? 'react-ts' : 'react-js';
		case 'vue':
			return 'vue';
		case 'svelte':
			return 'svelte';
		case 'jquery':
			return 'jquery';
		case 'vanilla':
			return ts ? 'vanilla-ts' : 'vanilla-js';
		default:
			return undefined;
	}
};

/**
 * The lint/type rules plugin. It ships per-framework default ESLint +
 * TypeScript presets, materialises them to the cache, detects each
 * project area's framework into a `rules-map.json` (the project's own
 * config always wins), and exposes mode-aware tools so any agent applies
 * the rules organically. Load with `mcp-vertex --plugins=rules`.
 */
export default definePlugin({
	name: 'rules',
	version: '0.1.0',
	describe:
		'Per-framework default ESLint/TypeScript presets + per-area detection + enforcement modes (strict/mixed/none/proposal). Project config always wins.',
	optionsSchema: z.object({
		mode: z.enum(['strict', 'mixed', 'none', 'proposal']).optional(),
		framework: z.string().optional(),
		language: z.enum(['ts', 'js']).optional(),
		/** area path → preset id, forcing detection for that area. */
		overrides: z.record(z.string(), z.string()).optional(),
	}),
	register(ctx) {
		const reader = createWorkspaceFileReader(ctx.workspace);
		const cacheRelDir = ctx.pluginCacheDir;
		const manifestRelPath = joinRel(cacheRelDir, 'rules-map.json');
		const projectName = projectNameFrom(reader, ctx.workspace.root);

		const rawMode =
			(ctx.options.mode as string | undefined) ??
			ctx.args['rules-mode'];
		const mode: IRulesMode = RULES_MODES.includes(rawMode as IRulesMode)
			? (rawMode as IRulesMode)
			: 'mixed';

		const overrides: Record<string, string> = {
			...((ctx.options.overrides as Record<string, string>) ?? {}),
		};
		const forced = presetIdFor(
			ctx.options.framework as string | undefined,
			ctx.options.language as string | undefined
		);
		if (forced !== undefined && PRESET_BY_ID.has(forced)) {
			overrides.root = forced;
		}

		const toolOptions: IRulesToolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspace: ctx.workspace,
			reader,
			projectName,
			cacheRelDir,
			manifestRelPath,
			mode,
			...(Object.keys(overrides).length > 0 ? { overrides } : {}),
		};

		// On boot: materialise the default presets and generate the
		// manifest if it does not exist yet. Never fail boot over this.
		try {
			const manifest = buildRulesManifest({
				reader,
				projectName,
				cacheRelDir,
				mode,
				...(Object.keys(overrides).length > 0 ? { overrides } : {}),
			});
			ensureRulesCache({
				resolve: (rel) => ctx.workspace.resolve(rel),
				cacheRelDir,
				manifest,
				manifestRelPath,
			});
		} catch {
			// best-effort; the tools still build the manifest in-memory.
		}

		return {
			tools: [
				buildGetRulesRegistration(toolOptions),
				buildCheckRulesRegistration(toolOptions),
				buildApplyRulesRegistration(toolOptions),
			],
			prompts: [
				{
					id: 'enforce_rules',
					register: async (server) => {
						server.registerPrompt(
							`${ctx.namespacePrefix}_enforce_rules`,
							{
								description:
									'Apply this project’s lint/type rules to your work, honouring the enforcement mode.',
							},
							async () => ({
								messages: [
									{
										role: 'user' as const,
										content: {
											type: 'text' as const,
											text: [
												`Call \`${ctx.namespacePrefix}_get_rules\` to learn each area's framework, conventions and the mode (${mode}).`,
												'Write new code already compliant. Then check_rules → apply_rules and execute the plan for the mode.',
												'The project’s own ESLint/tsconfig always takes precedence over the defaults.',
											].join('\n'),
										},
									},
								],
							})
						);
					},
				},
			],
			knowledge: [
				buildApplyingRulesKnowledge(
					ctx.namespacePrefix,
					mode,
					cacheRelDir
				),
			],
		};
	},
});
