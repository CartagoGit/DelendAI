// body-content/framework-hints: declarative table of "what does this
// framework require from the agent?".
//
// SOLID — Open/Closed. Adding a new framework is one entry in the
// `FRAMEWORK_HINTS` table. The body builders never need to change.

import type { IProjectAnalysis } from '../analyze-project';

/**
 * A read-only map of `framework → hints`. The fallback (no entry for
 * the project's framework) is an empty list — the body builders
 * render a "no extra hints" stub in that case.
 */
const FRAMEWORK_HINTS: Readonly<Record<string, readonly string[]>> = {
	angular: [
		'Standalone components only; no NgModules for new code.',
		'Use Angular signals for component state.',
		'OnPush change detection for presentational components.',
	],
	next: [
		'App Router + React Server Components by default.',
		'Use server actions for mutations, route handlers for APIs.',
	],
	react: [
		'Function components + hooks; no class components in new code.',
		'Co-locate styles and tests with the component.',
	],
	vue: ['Composition API + `<script setup>` for new components.'],
	svelte: ['Svelte 5 runes for new components; avoid legacy stores.'],
	solid: ['Fine-grained reactivity; avoid destructuring props.'],
};

/**
 * The body builder for the framework skill calls this. Returning an
 * empty array for an unknown framework is intentional — the caller
 * renders a stub.
 */
export const frameworkHintsFor = (
	analysis: IProjectAnalysis,
): readonly string[] => {
	if (analysis.framework === undefined) return [];
	return FRAMEWORK_HINTS[analysis.framework] ?? [];
};
