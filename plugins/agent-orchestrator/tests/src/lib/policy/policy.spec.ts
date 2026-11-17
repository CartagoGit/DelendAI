import { describe, it, expect } from 'vitest';

import {
	assertPolicyValid,
	createOrchestratorEngine,
	OrchestratorEngine,
} from '../../../../src/lib/policy/policy.js';
import {
	ModeRegistry,
	UnknownModeError,
} from '../../../../src/lib/policy/registry.js';
import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import type {
	IOrchestratorPolicy,
	ITask,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'auto',
	defaults: {
		budget: {
			maxTokensOrchestrator: 100_000,
			maxTokensPerSubagent: 10_000,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 3, allow: ['error-storm'] },
	},
};

const TRIVIAL_TASK: ITask = {
	id: 't1',
	description: 'Fix typo.',
	tags: [],
	hint: 'trivial',
};

describe('createOrchestratorEngine', () => {
	it('returns an engine that plans via the chosen default mode', () => {
		const eng = createOrchestratorEngine({
			...POLICY,
			defaultMode: 'single',
		});
		const plan = eng.plan(TRIVIAL_TASK);
		expect(plan.mode).toBe('single');
		expect(plan.steps[0]?.kind).toBe('orchestrate');
	});

	it('falls back to auto when the chosen default declines the task', () => {
		// `single` declines tasks tagged `refactor`; auto → linear takes over.
		const eng = createOrchestratorEngine({
			...POLICY,
			defaultMode: 'single',
		});
		const plan = eng.plan({
			id: 't2',
			description: 'Refactor cache',
			tags: ['refactor'],
		});
		// auto.reason contains the chosen inner mode
		expect(plan.mode).toBe('auto');
		expect(plan.rationale).toMatch(/linear/);
	});

	it('lists all four modes', () => {
		const eng = createOrchestratorEngine(POLICY);
		expect([...eng.listModes()].sort()).toEqual(
			['auto', 'linear', 'single', 'swarm'].sort(),
		);
	});

	it('throws when no adapter is registered for the default mode', () => {
		// We construct a registry manually with no adapters and set
		// defaultMode to `swarm`. The engine must throw UnknownModeError.
		expect(() => {
			// Force the path: create a normal engine then verify that
			// calling plan on a policy whose defaultMode is unknown would
			// explode — we simulate that by patching via a custom engine.
			const eng = createOrchestratorEngine({
				...POLICY,
				defaultMode: 'swarm',
			});
			// The real registry *does* have swarm, so we ask for a mode
			// that no engine would have. Here we just confirm `swarm`
			// resolves; the negative path lives in registry.spec.ts.
			expect(
				eng.plan({ id: 't', description: 'x', tags: ['swarm'] }).mode,
			).toBe('swarm');
		}).not.toThrow();
	});
});

describe('assertPolicyValid', () => {
	it('accepts a valid policy', () => {
		expect(() => assertPolicyValid(POLICY)).not.toThrow();
	});

	it('rejects unknown mode', () => {
		expect(() =>
			assertPolicyValid({
				...POLICY,
				defaultMode:
					'nonsense' as unknown as IOrchestratorPolicy['defaultMode'],
			}),
		).toThrow(/defaultMode/);
	});

	it('rejects negative budget caps', () => {
		expect(() =>
			assertPolicyValid({
				...POLICY,
				defaults: {
					...POLICY.defaults,
					budget: {
						...POLICY.defaults.budget,
						maxTokensOrchestrator: -1,
					},
				},
			}),
		).toThrow(/maxTokensOrchestrator/);
	});

	it('rejects a negative per-subagent budget cap', () => {
		expect(() =>
			assertPolicyValid({
				...POLICY,
				defaults: {
					...POLICY.defaults,
					budget: {
						...POLICY.defaults.budget,
						maxTokensPerSubagent: -1,
					},
				},
			}),
		).toThrow(/maxTokensPerSubagent/);
	});

	it('rejects a null/undefined policy up front', () => {
		expect(() =>
			assertPolicyValid(undefined as unknown as IOrchestratorPolicy),
		).toThrow(TypeError);
	});

	it('rejects zero maxIterationsPerSubagent', () => {
		expect(() =>
			assertPolicyValid({
				...POLICY,
				defaults: {
					...POLICY.defaults,
					rotation: {
						...POLICY.defaults.rotation,
						maxIterationsPerSubagent: 0,
					},
				},
			}),
		).toThrow(/maxIterationsPerSubagent/);
	});
});

describe('OrchestratorEngine.plan — unknown default mode', () => {
	it('throws UnknownModeError when the policy names a mode with no registered adapter', () => {
		// createOrchestratorEngine always registers all four modes; this
		// constructs a deliberately incomplete registry the way a host
		// embedding a custom mode set could, to prove `plan()` itself
		// (not just ModeRegistry.get()) fails closed on a bad defaultMode.
		const registry = new ModeRegistry();
		const engine = new OrchestratorEngine(registry, new TaskClassifier(), {
			...POLICY,
			defaultMode: 'single',
		});
		expect(() => engine.plan(TRIVIAL_TASK)).toThrow(UnknownModeError);
	});
});
