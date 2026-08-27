import { describe, it, expect } from 'vitest';

import { createOrchestratorEngine } from '../../../../src/lib/policy/policy.js';
import {
	OrchestratorPolicySchema,
	resolveEffectivePolicyForMode,
} from '../../../../src/lib/policy/types.js';
import type { IOrchestratorPolicy } from '../../../../src/lib/policy/types.js';

const BASE_POLICY: IOrchestratorPolicy = {
	defaultMode: 'auto',
	defaults: {
		budget: {
			maxTokensOrchestrator: 200_000,
			maxTokensPerSubagent: 50_000,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 3,
			allow: ['error-storm'],
		},
	},
};

describe('resolveEffectivePolicyForMode', () => {
	it('returns the same policy unchanged when no override exists for the mode', () => {
		const effective = resolveEffectivePolicyForMode(BASE_POLICY, 'single');
		expect(effective).toBe(BASE_POLICY);
	});

	it('merges only the overridden fields, leaving the rest at defaults', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			perMode: {
				linear: { budget: { maxTokensPerSubagent: 5_000 } },
			},
		};
		const effective = resolveEffectivePolicyForMode(policy, 'linear');
		expect(effective.defaults.budget).toEqual({
			maxTokensOrchestrator: 200_000, // untouched
			maxTokensPerSubagent: 5_000, // overridden
			timeoutMs: 0, // untouched
		});
		// Rotation wasn't overridden for `linear`, so it must pass through as-is.
		expect(effective.defaults.rotation).toEqual(
			BASE_POLICY.defaults.rotation,
		);
	});

	it("a mode's override never leaks into another mode's effective policy", () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			perMode: {
				swarm: { budget: { maxTokensPerSubagent: 1_000 } },
			},
		};
		expect(
			resolveEffectivePolicyForMode(policy, 'linear').defaults.budget
				.maxTokensPerSubagent,
		).toBe(50_000);
		expect(
			resolveEffectivePolicyForMode(policy, 'swarm').defaults.budget
				.maxTokensPerSubagent,
		).toBe(1_000);
	});

	it('a rotation.allow override fully replaces the base allowlist (no merge)', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			perMode: {
				single: { rotation: { allow: ['schema-violation'] } },
			},
		};
		const effective = resolveEffectivePolicyForMode(policy, 'single');
		expect(effective.defaults.rotation.allow).toEqual(['schema-violation']);
	});
});

describe('per-mode overrides take effect through OrchestratorEngine.plan()', () => {
	it('single mode: a low maxTokensOrchestrator override removes the self-verify step', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			defaultMode: 'single',
			perMode: {
				single: { budget: { maxTokensOrchestrator: 1_000 } },
			},
		};
		const engine = createOrchestratorEngine(policy);
		const plan = engine.plan({
			id: 't1',
			description: 'Fix typo.',
			tags: [],
			hint: 'trivial',
		});
		expect(plan.mode).toBe('single');
		expect(plan.budget.maxTokensOrchestrator).toBe(1_000);
		// Under 20_000 ⇒ single-mode's self-verify step is skipped.
		expect(plan.steps.some((s) => s.kind === 'verify')).toBe(false);
	});

	it('single mode: the default (no override) still gets the self-verify step', () => {
		const engine = createOrchestratorEngine({
			...BASE_POLICY,
			defaultMode: 'single',
		});
		const plan = engine.plan({
			id: 't1',
			description: 'Fix typo.',
			tags: [],
			hint: 'trivial',
		});
		expect(plan.steps.some((s) => s.kind === 'verify')).toBe(true);
	});

	it('linear mode: a maxIterationsPerSubagent override is reflected in the plan', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			defaultMode: 'linear',
			perMode: {
				linear: { rotation: { maxIterationsPerSubagent: 7 } },
			},
		};
		const engine = createOrchestratorEngine(policy);
		const plan = engine.plan({
			id: 't2',
			description: 'Refactor the cache layer end to end.',
			tags: ['refactor'],
		});
		expect(plan.mode).toBe('linear');
		expect(plan.rotation.maxIterationsPerSubagent).toBe(7);
	});

	it('swarm mode: a maxTokensPerSubagent override is reflected in the plan', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			defaultMode: 'swarm',
			perMode: {
				swarm: { budget: { maxTokensPerSubagent: 12_345 } },
			},
		};
		const engine = createOrchestratorEngine(policy);
		const plan = engine.plan({
			id: 't3',
			description: 'Audit the whole repo',
			tags: ['swarm'],
		});
		expect(plan.mode).toBe('swarm');
		expect(plan.budget.maxTokensPerSubagent).toBe(12_345);
	});

	it('auto mode: the override for the *inner* (classified) mode applies, not the outer `auto` entry', () => {
		const policy: IOrchestratorPolicy = {
			...BASE_POLICY,
			defaultMode: 'auto',
			perMode: {
				linear: { budget: { maxTokensPerSubagent: 999 } },
				// A same-named override for `auto` itself must NOT apply —
				// `auto` never executes work directly.
				auto: { budget: { maxTokensPerSubagent: 1 } },
			},
		};
		const engine = createOrchestratorEngine(policy);
		const plan = engine.plan({
			id: 't4',
			description: 'Medium-sized refactor across a couple of files.',
			tags: ['refactor'],
		});
		expect(plan.mode).toBe('auto');
		expect(plan.rationale).toMatch(/→ linear/);
		expect(plan.budget.maxTokensPerSubagent).toBe(999);
	});
});

describe('OrchestratorPolicySchema — perMode validation at the I/O edge', () => {
	const validBase = {
		defaultMode: 'auto' as const,
		defaults: BASE_POLICY.defaults,
	};

	it('accepts a well-formed perMode override', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				linear: { budget: { maxTokensPerSubagent: 10_000 } },
			},
		});
		expect(result.success).toBe(true);
	});

	it('rejects an unknown field inside a budget override (typo)', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				linear: { budget: { maxToknsPerSubagent: 10_000 } },
			},
		});
		expect(result.success).toBe(false);
	});

	it('rejects an unknown top-level key inside a mode override', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				linear: { notAField: true },
			},
		});
		expect(result.success).toBe(false);
	});

	it('rejects a negative budget value inside an override', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				swarm: { budget: { maxTokensOrchestrator: -1 } },
			},
		});
		expect(result.success).toBe(false);
	});

	it('rejects a zero maxIterationsPerSubagent inside a rotation override', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				single: { rotation: { maxIterationsPerSubagent: 0 } },
			},
		});
		expect(result.success).toBe(false);
	});

	it('rejects an unknown mode key', () => {
		const result = OrchestratorPolicySchema.safeParse({
			...validBase,
			perMode: {
				turbo: { budget: { maxTokensPerSubagent: 1 } },
			},
		});
		expect(result.success).toBe(false);
	});
});
