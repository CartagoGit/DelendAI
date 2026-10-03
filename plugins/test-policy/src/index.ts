import { isAbsolute } from 'node:path';

import { definePlugin } from '@delendai/core/public';
import z from 'zod';

import {
	POLICY_GUIDANCE,
	resolveTestPolicy,
	TEST_POLICY_MODES,
} from './lib/policy';
import { readPolicyOverride } from './lib/policy-store';
import { buildGetPolicyRegistration } from './lib/tools/get-policy.tool';
import { buildSetPolicyRegistration } from './lib/tools/set-policy.tool';

/**
 * `@delendai/test-policy` — declarative test-writing policy for
 * agents (f00115).
 *
 * The workspace declares WHEN/WHETHER the LLM writes tests; the plugin
 * surfaces that contract to every agent through `get_test_policy`,
 * `set_test_policy` and a knowledge entry rendered at orientation.
 * Four modes, default `tdd`:
 *
 *   - `tdd` — write the failing test first, prove it red, implement to
 *     green, refactor green (THE DEFAULT).
 *   - `tests-after` — implement first, cover before closing.
 *   - `free` — the agent decides and states its choice.
 *   - `none` — no new tests (spike mode); the suite must still pass.
 *
 * Precedence: runtime override (set tool, persisted in the plugin
 * cache) > `options.mode` > `tdd`. Like status-marker, enforcement is
 * agent-driven until the core grows response hooks.
 */
const OptionsSchema = z
	.object({
		/** Workspace default mode; omitted = `tdd`. */
		mode: z.enum(TEST_POLICY_MODES).optional(),
		/** Free-text, project-specific addendum appended to the guidance. */
		extraGuidance: z.string().max(2000).optional(),
		/** Allow agents to override at runtime via set_test_policy (default true). */
		allowSetTool: z.boolean().optional(),
	})
	.strict();

const renderKnowledge = (input: {
	mode: (typeof TEST_POLICY_MODES)[number];
	source: string;
	extraGuidance?: string | undefined;
}): string =>
	[
		'# Test policy — when/whether to write tests',
		'',
		`Active mode: **${input.mode}** (source: ${input.source}).`,
		'',
		...POLICY_GUIDANCE[input.mode].map((line) => `- ${line}`),
		...(input.extraGuidance !== undefined
			? ['', `Project addendum: ${input.extraGuidance}`]
			: []),
		'',
		'Check `<prefix>_get_test_policy` for the live value (a runtime',
		'override may supersede this snapshot); change it with',
		'`<prefix>_set_test_policy { mode }` or `{ clear: true }`.',
	].join('\n');

export default definePlugin({
	name: 'test-policy',
	version: '0.1.1',
	describe:
		'Declarative test policy for agents: tdd (default), tests-after, free or none — with imperative guidance, durable runtime override, and an orientation knowledge entry.',
	optionsSchema: OptionsSchema,
	configExample: {
		summary:
			'Declares how agents should treat tests: TDD by default; switch the mode or freeze it by forbidding runtime overrides.',
		options: {
			mode: 'tdd',
			extraGuidance:
				'Protocol behaviour additionally needs an e2e against the in-memory MCP server.',
			allowSetTool: true,
		},
	},
	async register(ctx) {
		const parsed = OptionsSchema.safeParse(ctx.options ?? {});
		if (!parsed.success) {
			// A typo'd mode must fail the boot loudly, not silently fall
			// back to tdd and hide the host's intent.
			throw new Error(
				`test-policy plugin rejected its options: ${parsed.error.message}`,
			);
		}
		const opts = parsed.data;
		const storeDir = isAbsolute(ctx.pluginCacheDir)
			? ctx.pluginCacheDir
			: ctx.workspace.resolve(ctx.pluginCacheDir);
		const toolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			storeDir,
			configMode: opts.mode,
			extraGuidance: opts.extraGuidance,
			allowSetTool: opts.allowSetTool,
		};

		// Boot-time snapshot for the knowledge entry: reflects any
		// persisted override so orientation shows the LIVE policy, not
		// just the config default.
		const override = await readPolicyOverride(storeDir);
		const resolved = resolveTestPolicy({
			configMode: opts.mode,
			override: override?.mode,
		});

		return {
			tools: [
				buildGetPolicyRegistration(toolOptions),
				buildSetPolicyRegistration(toolOptions),
			],
			knowledge: [
				{
					id: 'test-policy',
					title: 'Test policy — when/whether agents write tests',
					body: renderKnowledge({
						mode: resolved.mode,
						source: resolved.source,
						extraGuidance: opts.extraGuidance,
					}),
				},
			],
		};
	},
});
