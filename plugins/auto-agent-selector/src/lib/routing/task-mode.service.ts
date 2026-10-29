/**
 * task-mode.ts — maps a free-form task type onto the ranking's task mode,
 * so the kind of task shapes which provider tier is preferred.
 */
import type { IRankTask } from '@delendai/core/contracts';

type TTaskMode = NonNullable<IRankTask['mode']>;

const MODE_PATTERNS: readonly (readonly [TTaskMode, RegExp])[] = [
	['plan', /\b(plan|planning|design|architect\w*|spec\w*)\b/u],
	['review', /\b(review\w*|audit\w*|verify|check)\b/u],
	[
		'explore',
		/\b(explor\w*|research|search|investigat\w*|triage|discover\w*)\b/u,
	],
	[
		'implement',
		/\b(implement\w*|build|code|coding|fix\w*|refactor\w*|write)\b/u,
	],
];

/** The mode a task type names, or undefined when it names none. */
export const modeForTaskType = (
	taskType: string | undefined,
): TTaskMode | undefined => {
	if (taskType === undefined) return undefined;
	const normalized = taskType.toLowerCase();
	return MODE_PATTERNS.find(([, pattern]) => pattern.test(normalized))?.[0];
};
