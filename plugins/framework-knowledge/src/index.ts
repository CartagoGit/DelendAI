import z from 'zod';

import { definePlugin } from '@delendai/core/public';

/**
 * `@delendai/framework-knowledge`.
 *
 * Answers "what does the project's INSTALLED framework version allow,
 * recommend and forbid" before an agent writes code, as one small,
 * versioned, evidence-backed answer instead of thousands of tokens of
 * general training-knowledge guesswork.
 *
 * This entry registers NO tools yet. The library they will be built on
 * lands first — the knowledge record shape and its force
 * (`knowledge-record.ts`), the policy resolver and the detected-convention
 * input — all pure and independently tested. Until the tools exist the
 * plugin has nothing to expose and is absent from every preset (see
 * `plugin.manifest.ts`), and it takes no options.
 */
const OptionsSchema = z.object({});

export default definePlugin({
	name: 'framework-knowledge',
	version: '0.1.0',
	describe:
		'Resolves what the installed framework version allows, recommends and forbids, as a small cached answer instead of general training knowledge.',
	optionsSchema: OptionsSchema,
	register() {
		return { tools: [] };
	},
});
