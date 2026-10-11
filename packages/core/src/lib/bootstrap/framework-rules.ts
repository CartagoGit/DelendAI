// framework-rules: declarative table for "which dependency name
// signals which framework?".
//
// SOLID — Open/Closed. The previous `detectFramework` was a 6-line
// `if`-cascade in `analyze-project.ts`; adding a framework meant
// editing that body. The table form lets you add a framework (or
// override priority) by appending one entry. The matcher is pure
// pipeline.

/**
 * A single framework detection rule. `depName` is the npm package
 * the analyser looks for in the project's dependencies. Priority
 * is descending (the first match wins).
 */
export interface IFrameworkRule {
	readonly id: string;
	readonly depName: string;
	readonly priority: number;
}

export const DEFAULT_FRAMEWORK_RULES: readonly IFrameworkRule[] = [
	{ id: 'angular', depName: '@angular/core', priority: 70 },
	{ id: 'next', depName: 'next', priority: 60 },
	{ id: 'react', depName: 'react', priority: 50 },
	{ id: 'vue', depName: 'vue', priority: 40 },
	{ id: 'svelte', depName: 'svelte', priority: 30 },
	{ id: 'solid', depName: 'solid-js', priority: 20 },
];

/**
 * The default game-engine detection: any of these deps means the
 * project is a game (see `project-type-rules.ts` priority 90).
 */
export const GAME_ENGINE_DEPS: readonly string[] = [
	'phaser',
	'three',
	'pixi.js',
	'babylonjs',
];

/**
 * Pure matcher: returns the first framework rule whose `depName`
 * is present in `deps`, or `undefined` when none apply.
 */
export const matchFramework = (
	deps: Readonly<Record<string, string>>,
	rules: readonly IFrameworkRule[] = DEFAULT_FRAMEWORK_RULES,
): string | undefined => {
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	for (const rule of sorted) {
		if (rule.depName in deps) return rule.id;
	}
	return undefined;
};

export const isGameProject = (
	deps: Readonly<Record<string, string>>,
	engines: readonly string[] = GAME_ENGINE_DEPS,
): boolean => {
	for (const engine of engines) {
		if (engine in deps) return true;
	}
	return false;
};
