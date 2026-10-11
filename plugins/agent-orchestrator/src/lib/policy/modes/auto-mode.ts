/**
 * `auto` mode — the orchestrator classifies each task and delegates
 * to the cheapest mode that accepts it.
 *
 * Status: S4 stub. Locks the *router* behaviour (delegates to the
 * classifier + inner registry) so S1 can wire `auto` end-to-end.
 * Implementation note: `auto` is registered as a *real* adapter
 * (not a meta-mode) so the registry loop is symmetric.
 */
import { resolveEffectivePolicyForMode } from '../types.js';
import type {
	IModeAdapter,
	IModePlan,
	IOrchestratorPolicy,
	ITask,
} from '../types.js';
import type { TaskClassifier } from '../../classifier/task-classifier.js';
import type { ModeRegistry } from '../registry.js';

export class AutoModeAdapter implements IModeAdapter {
	readonly id = 'auto' as const;

	readonly #classifier: TaskClassifier;
	readonly #registry: ModeRegistry;

	constructor(classifier: TaskClassifier, registry: ModeRegistry) {
		this.#classifier = classifier;
		this.#registry = registry;
	}

	accepts(_task: ITask, policy: IOrchestratorPolicy): boolean {
		return policy.defaultMode === 'auto';
	}

	plan(task: ITask, policy: IOrchestratorPolicy): IModePlan {
		const verdict = this.#classifier.classify(task, policy);
		const adapter = this.#registry.get(verdict.mode);
		const effectivePolicy = resolveEffectivePolicyForMode(
			policy,
			verdict.mode,
		);
		const inner = adapter.plan(task, effectivePolicy);
		return {
			mode: 'auto',
			rationale: `auto → ${verdict.mode} (${verdict.reason})`,
			steps: inner.steps,
			budget: inner.budget,
			rotation: inner.rotation,
		};
	}
}
