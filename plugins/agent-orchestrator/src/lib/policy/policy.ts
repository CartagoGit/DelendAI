/**
 * The planner façade — what the S1 tool calls into.
 *
 * Holds the registry + classifier; resolves the `defaultMode`
 * out of policy, then runs the chosen adapter. Pure w.r.t. filesystem:
 * identical `(task, policy)` ⇒ identical plan.
 *
 * Lifecycle:
 *
 *   const engine = createOrchestratorEngine(policy, classifier);
 *   const plan = engine.plan(task);
 *
 * The engine is safe to use across tasks (the registry & classifier
 * are configuration, not state). Tests build a fresh engine per spec.
 */
import { TaskClassifier } from '../classifier/task-classifier.js';
import { AutoModeAdapter } from './modes/auto-mode.js';
import { LinearModeAdapter } from './modes/linear-mode.js';
import { SingleModeAdapter } from './modes/single-mode.js';
import { SwarmModeAdapter } from './modes/swarm-mode.js';
import { ModeRegistry, UnknownModeError } from './registry.js';
import { resolveEffectivePolicyForMode } from './types.js';
import type {
	IModePlan,
	IOrchestratorPolicy,
	ITask,
	OrchestrationMode,
} from './types.js';

/** Re-export the policy constants from the types module so consumers
 *  can `import { DEFAULT_BUDGET_POLICY } from "<plugin>/public"`. */
export {
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
	OrchestratorPolicySchema,
	ModeOverrideSchema,
	resolveEffectivePolicyForMode,
} from './types.js';
export type { IOrchestratorPolicy, IModeOverride } from './types.js';

export class OrchestratorEngine {
	readonly #registry: ModeRegistry;
	readonly #policy: IOrchestratorPolicy;

	constructor(
		registry: ModeRegistry,
		_classifier: TaskClassifier,
		policy: IOrchestratorPolicy,
	) {
		this.#registry = registry;
		this.#policy = policy;
	}

	plan(task: ITask): IModePlan {
		const mode = this.#policy.defaultMode;
		if (!this.#registry.has(mode)) {
			throw new UnknownModeError(mode);
		}
		const adapter = this.#registry.get(mode);
		if (!adapter.accepts(task, this.#policy)) {
			// Fall back to auto when the named mode declines; auto will
			// re-route through the classifier (and resolve `perMode` for
			// whichever concrete mode it picks). Done silently so the host
			// gets a plan instead of an error.
			const auto = this.#registry.get('auto');
			return auto.plan(task, this.#policy);
		}
		// `auto` resolves its own inner mode's overrides once the
		// classifier picks one; resolving here too would double-apply.
		if (adapter.id === 'auto') {
			return adapter.plan(task, this.#policy);
		}
		const effectivePolicy = resolveEffectivePolicyForMode(
			this.#policy,
			adapter.id,
		);
		return adapter.plan(task, effectivePolicy);
	}

	listModes(): readonly OrchestrationMode[] {
		return this.#registry.list().map((a) => a.id);
	}
}

/**
 * Build an engine with the default adapter set (single + linear +
 * swarm + auto). Hosts that need additional modes can build their own
 * registry and pass it here.
 */
export function createOrchestratorEngine(
	policy: IOrchestratorPolicy,
	classifier?: TaskClassifier,
): OrchestratorEngine {
	const registry = new ModeRegistry();
	registry.register(new SingleModeAdapter());
	registry.register(new LinearModeAdapter());
	registry.register(new SwarmModeAdapter());

	const cls = classifier ?? new TaskClassifier();
	registry.register(new AutoModeAdapter(cls, registry));

	return new OrchestratorEngine(registry, cls, policy);
}

/**
 * Validate an arbitrary policy shape coming from
 * `delendai.config.json`. Throws on the first inconsistency so the
 * plugin `register()` can fail fast.
 */
export function assertPolicyValid(policy: IOrchestratorPolicy): void {
	if (!policy) throw new TypeError('policy is required');
	const modes = ['single', 'linear', 'swarm', 'auto'] as const;
	if (!(modes as readonly string[]).includes(policy.defaultMode)) {
		throw new RangeError(
			`defaultMode must be one of ${modes.join(', ')}; got "${policy.defaultMode}"`,
		);
	}
	if (policy.defaults.budget.maxTokensOrchestrator < 0) {
		throw new RangeError('budget.maxTokensOrchestrator must be ≥ 0');
	}
	if (policy.defaults.budget.maxTokensPerSubagent < 0) {
		throw new RangeError('budget.maxTokensPerSubagent must be ≥ 0');
	}
	if (policy.defaults.rotation.maxIterationsPerSubagent <= 0) {
		throw new RangeError('rotation.maxIterationsPerSubagent must be ≥ 1');
	}
}
