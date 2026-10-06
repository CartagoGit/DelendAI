/**
 * `single` mode — the orchestrator does everything itself, in one step.
 *
 * Implementation: a single `orchestrate` step plus an optional `verify`
 * step when the policy budgets allow a quick self-check. No subagents
 * are spawned. This is the cheapest mode in tokens because there is
 * no handoff overhead, and the most predictable because the entire
 * run lives in one context window.
 *
 * Conditions for `accepts()`:
 *
 *   - The task is **trivial or small** by host hint OR
 *   - The task description is ≤ `SINGLE_DESCRIPTION_BUDGET` characters
 *     AND carries zero "complex" tags from `COMPLEX_TAGS`.
 *
 * Anything else falls through to `auto` (which routes to `linear`
 * or `swarm`).
 */
import type {
	IModeAdapter,
	IModePlan,
	IOrchestratorPolicy,
	IPlanStep,
	ITask,
} from '../types.js';

/** Tags whose presence flips a task out of `single` mode. */
const COMPLEX_TAGS: ReadonlySet<string> = new Set([
	'audit',
	'migrate',
	'refactor',
	'orchestrate',
	'swarm',
	'root',
]);

/** Description size budget above which `single` declines to plan. */
const SINGLE_DESCRIPTION_BUDGET = 280;

/**
 * Trivial hints always go to `single`; small hints go to `single`
 * unless the description looks big.
 */
const SINGLE_HINTS: ReadonlySet<NonNullable<ITask['hint']>> = new Set([
	'trivial',
	'small',
]);

export class SingleModeAdapter implements IModeAdapter {
	readonly id = 'single' as const;

	accepts(task: ITask, _policy: IOrchestratorPolicy): boolean {
		if (task.hint && SINGLE_HINTS.has(task.hint)) {
			return !this.#looksComplex(task);
		}
		return (
			task.description.length <= SINGLE_DESCRIPTION_BUDGET &&
			!this.#looksComplex(task)
		);
	}

	plan(task: ITask, policy: IOrchestratorPolicy): IModePlan {
		const steps: IPlanStep[] = [
			{
				order: 1,
				kind: 'orchestrate',
				instruction: task.description,
			},
		];

		const budget = mergeBudget(policy.defaults.budget);
		const rotation = mergeRotation(policy.defaults.rotation);

		// Cheap self-verification — only when budget allows it without
		// squeezing the orchestrator. S1 keeps the shape small.
		if (budget.maxTokensOrchestrator >= 20_000) {
			steps.push({
				order: 2,
				kind: 'verify',
				instruction:
					'Self-verify the work against the task description.',
				dependsOn: [1],
			});
		}

		return {
			mode: this.id,
			rationale:
				'Task is trivial/small enough for the orchestrator alone.',
			steps,
			budget,
			rotation,
		};
	}

	#looksComplex(task: ITask): boolean {
		if (task.tags.some((t) => COMPLEX_TAGS.has(t.toLowerCase()))) {
			return true;
		}
		if (task.hint === 'large') return true;
		return false;
	}
}

function mergeBudget(
	base: IOrchestratorPolicy['defaults']['budget'],
): IModePlan['budget'] {
	// Single mode passes the defaults through unchanged; per-mode overrides
	// merge in the tool layer (S2) so this adapter stays pure.
	return { ...base };
}

function mergeRotation(
	base: IOrchestratorPolicy['defaults']['rotation'],
): IModePlan['rotation'] {
	// Rotation is moot in single mode, but we surface the policy so the
	// executor knows the orchestrator is allowed to self-rotate per the
	// same triggers (e.g. retry with a fresh context).
	return {
		maxIterationsPerSubagent: 1,
		allow: base.allow,
	};
}
