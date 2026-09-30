import { definePlugin } from '@delendai/core/public';

/**
 * `@delendai/framework-knowledge` — f00547.
 *
 * Answers "what does the project's INSTALLED framework version allow,
 * recommend and forbid" before an agent writes code, as one small,
 * versioned, evidence-backed answer instead of thousands of tokens of
 * general training-knowledge guesswork.
 *
 * This entry currently registers NO tools. S2 (this slice) through S4
 * land the library the tools will be built on — the knowledge record
 * shape and its force (`knowledge-record.ts`), the policy resolver
 * (`policy/resolve-policy.ts`) and the detected-convention input
 * (`detect/detect-convention.ts`) — all pure, all independently
 * tested. S5 adds `framework_guidance` / `framework_source`, the
 * on-disk cache, and decides what permissions those tools need; until
 * then the plugin has nothing to expose and is deliberately absent
 * from every preset (see `plugin.manifest.ts`).
 */
export default definePlugin({
	name: 'framework-knowledge',
	version: '0.1.0',
	describe:
		'Resolves what the installed framework version allows, recommends and forbids, as a small cached answer instead of general training knowledge.',
	register() {
		return { tools: [] };
	},
});
