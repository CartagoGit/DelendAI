/**
 * plugin-add.tool.ts — f00141 S2: `<prefix>_plugin_add` MCP tool.
 *
 * Composes `buildPluginAddRecipe` for a given plugin id, returns
 * the ordered recipe (install -> wire -> config) so the agent can
 * execute it. The tool is **planning-only**: the recipe is data;
 * the actual install + wire + config write is the caller's job,
 * surfaced via the same `effects: ['network', 'write']` declaration
 * the create-plugin tool already uses.
 *
 * Community entries (`origin === 'community'`) require an explicit
 * `consent: true` argument — the tool refuses without it.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolJson } from '@delendai/core/public';

import { buildPluginAddRecipe, type IPluginAddStep } from './plugin-add';
import { PRESET_KIND } from '../plugins/preset-catalog';
import type { IPluginRegistrySource } from '../contracts/interfaces/plugin-registry.interface';

export interface IPluginAddToolOptions {
	readonly namespacePrefix: string;
	readonly sources?: readonly IPluginRegistrySource[];
	readonly alreadyAdoptedIds?: readonly string[];
}

const STEP = z.object({
	kind: z.enum(['install', 'wire', 'config']),
	summary: z.string(),
	detail: z.record(z.string(), z.unknown()),
});

const RECIPE_OUTPUT = z.object({
	entry: z.object({
		id: z.string(),
		package: z.string(),
		summary: z.string(),
		tags: z.array(z.string()),
		origin: z.enum(['first-party', 'community']),
		// Accept the canonical preset ids + the legacy 'vertex' brand alias
		// (still valid input; resolvePresetMembers normalises it).
		defaultPreset: z
			.enum([
				...PRESET_KIND,
				'vertex', // legacy brand alias → resolves to 'dogfood'
			])
			.optional(),
	}),
	steps: z.array(STEP),
	alreadyAdopted: z.boolean(),
});

export const buildPluginAddRegistration = (
	options: IPluginAddToolOptions,
): IToolRegistration => ({
	id: 'plugin_add',
	summary:
		'Plan the adopt of a plugin: produce the install + wire + config recipe. Pure planning; the agent executes each step.',
	tags: ['plugin', 'registry', 'adopt'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_plugin_add`,
			{
				description:
					'Plan the adopt of a plugin (id from FIRST_PARTY_PLUGIN_INDEX or a community source the caller passes). Returns the install -> wire -> config recipe. Community entries require explicit consent: true.',
				inputSchema: z.object({
					id: z.string().min(1),
					consent: z.boolean().optional(),
					monorepoDev: z
						.boolean()
						.optional()
						.describe(
							'x00161: set true ONLY when this call is adding a first-party plugin to the @delendai/core monorepo itself (tsconfig/vitest/preset-catalog/publish-order/tool-outputs wiring applies). Leave unset/false for any project that consumes @delendai/core as an npm dependency.',
						),
				}),
				outputSchema: RECIPE_OUTPUT,
			},
			async (args: {
				id: string;
				consent?: boolean | undefined;
				monorepoDev?: boolean | undefined;
			}) => {
				const recipe = buildPluginAddRecipe(args.id, {
					...(options.sources !== undefined
						? { sources: options.sources }
						: {}),
					...(options.alreadyAdoptedIds !== undefined
						? { alreadyAdoptedIds: options.alreadyAdoptedIds }
						: {}),
					...(args.monorepoDev !== undefined
						? { monorepoDev: args.monorepoDev }
						: {}),
				});
				if (recipe === undefined) {
					return toolError(
						`Unknown plugin id: "${args.id}"`,
						'Pass an id from FIRST_PARTY_PLUGIN_INDEX (or a community source you have registered).',
					);
				}
				if (
					recipe.entry.origin === 'community' &&
					args.consent !== true
				) {
					return toolError(
						`"${args.id}" is a community plugin; adopt requires consent: true.`,
						'Re-call with `{ "id": "<id>", "consent": true }` to confirm.',
					);
				}
				return toolJson({
					entry: recipe.entry,
					steps: recipe.steps as readonly IPluginAddStep[],
					alreadyAdopted: recipe.alreadyAdopted,
				});
			},
		);
	},
});
