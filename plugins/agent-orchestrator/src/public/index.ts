/**
 * Public surface of `@delendai/agent-orchestrator`.
 *
 * Re-exports every type and adapter that another plugin might want
 * to import (without reaching into `src/lib/...`). The core's
 * external-source alias points at this file so `dist/public/...` is
 * generated from here.
 */
export type {
	IOrchestratorPolicy,
	IModeOverride,
	OrchestrationMode,
	ITask,
	IPlanStep,
	PlanStepKind,
	SubagentRole,
	IModePlan,
	IBudgetPolicy,
	IRotationPolicy,
	RotationReason,
	TaskComplexityHint,
} from '../lib/policy/types.js';

export {
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
	ORCHESTRATION_MODES,
	OrchestratorPolicySchema,
	ModeOverrideSchema,
	PerModeOverridesSchema,
	resolveEffectivePolicyForMode,
} from '../lib/policy/types.js';

export {
	ModeRegistry,
	UnknownModeError,
	DuplicateModeError,
} from '../lib/policy/registry.js';
export type { IModeAdapter } from '../lib/policy/registry.js';

export {
	OrchestratorEngine,
	createOrchestratorEngine,
	assertPolicyValid,
} from '../lib/policy/policy.js';

export { SingleModeAdapter } from '../lib/policy/modes/single-mode.js';
export { LinearModeAdapter } from '../lib/policy/modes/linear-mode.js';
export { SwarmModeAdapter } from '../lib/policy/modes/swarm-mode.js';
export { AutoModeAdapter } from '../lib/policy/modes/auto-mode.js';

export { TaskClassifier } from '../lib/classifier/task-classifier.js';
export type { IClassificationVerdict } from '../lib/classifier/task-classifier.js';

export { BudgetTracker } from '../lib/budget/budget-tracker.js';
export type { IBudgetUsage } from '../lib/budget/budget-tracker.js';

export { LoopDetector } from '../lib/rotation/loop-detector.js';
export type {
	IRotationStep,
	IRotationVerdict,
} from '../lib/rotation/loop-detector.js';

export { FakeDispatchPort } from '../lib/dispatch/fake-port.js';
export type {
	IFakeDispatchPortDeps,
	IFakeScript,
	IFakeScriptStep,
} from '../lib/dispatch/fake-port.js';
export type {
	IDispatchPort,
	IPlanOutcome,
	IPlanOutcomeBudget,
	IStepOutcome,
	ISubagentResult,
} from '../lib/dispatch/contracts.js';
export { LinearDispatcher } from '../lib/dispatch/linear-dispatcher.js';
export {
	resolveDispatchPort,
	MissingDispatchPortError,
	InvalidDispatchPortFactoryError,
} from '../lib/dispatch/port-resolution.helper.js';
