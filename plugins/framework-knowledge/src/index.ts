import z from 'zod';

import { definePlugin, joinUnderRoot } from '@delendai/core/public';

import { buildGuidanceRegistration } from './lib/tools/guidance.tool';
import { buildSourceRegistration } from './lib/tools/source.tool';

/**
 * `@delendai/framework-knowledge`.
 *
 * Answers "what does the project's INSTALLED framework version allow,
 * recommend and forbid" before an agent writes code, as one small,
 * versioned, evidence-backed answer instead of thousands of tokens of
 * general training-knowledge guesswork.
 *
 * Two tools: `framework_guidance` returns the small resolved answer for a
 * topic, `framework_source` the evidence behind one rule. Both answer from
 * a cache keyed by the resolved framework version. The plugin is absent
 * from every preset (see `plugin.manifest.ts`) and takes no options.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'framework-knowledge',
	version: '0.1.0',
	describe:
		'Resolves what the installed framework version allows, recommends and forbids, as a small cached answer instead of general training knowledge.',
	optionsSchema: OptionsSchema,
	register(ctx) {
		const toolOptions = {
			namespacePrefix: ctx.namespacePrefix,
			workspaceRootAbs: ctx.workspace.root,
			cacheRootAbs: joinUnderRoot(ctx.workspace.root, ctx.cacheDir),
		};
		return {
			tools: [
				buildGuidanceRegistration(toolOptions),
				buildSourceRegistration(toolOptions),
			],
		};
	},
});
