import { describe, it, expect } from 'vitest';

import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import { AutoModeAdapter } from '../../../../src/lib/policy/modes/auto-mode.js';
import { LinearModeAdapter } from '../../../../src/lib/policy/modes/linear-mode.js';
import { SingleModeAdapter } from '../../../../src/lib/policy/modes/single-mode.js';
import { SwarmModeAdapter } from '../../../../src/lib/policy/modes/swarm-mode.js';
import { ModeRegistry } from '../../../../src/lib/policy/registry.js';
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

function buildRegistry(classifier: TaskClassifier): {
	registry: ModeRegistry;
	auto: AutoModeAdapter;
} {
	const registry = new ModeRegistry();
	registry.register(new SingleModeAdapter());
	registry.register(new LinearModeAdapter());
	registry.register(new SwarmModeAdapter());
	const auto = new AutoModeAdapter(classifier, registry);
	registry.register(auto);
	return { registry, auto };
}

describe('AutoModeAdapter', () => {
	it('accepts only when the configured default is auto', () => {
		const cls = new TaskClassifier();
		const { auto } = buildRegistry(cls);
		expect(
			auto.accepts({ id: 't', description: 'x', tags: [] }, POLICY),
		).toBe(true);
		expect(
			auto.accepts(
				{ id: 't', description: 'x', tags: [] },
				{ ...POLICY, defaultMode: 'linear' },
			),
		).toBe(false);
	});

	it('routes a trivial task to single with rationalle', () => {
		const cls = new TaskClassifier();
		const { auto } = buildRegistry(cls);
		const task: ITask = {
			id: 't',
			description: 'Replace the typo.',
			tags: [],
			hint: 'trivial',
		};
		const plan = auto.plan(task, POLICY);
		expect(plan.mode).toBe('auto');
		expect(plan.rationale).toMatch(/→ single/);
		expect(plan.steps[0]?.kind).toBe('orchestrate');
	});

	it('routes a swarm-tagged task to swarm', () => {
		const cls = new TaskClassifier();
		const { auto } = buildRegistry(cls);
		const task: ITask = {
			id: 't',
			description: 'Audit the whole repo',
			tags: ['swarm'],
		};
		const plan = auto.plan(task, POLICY);
		expect(plan.rationale).toMatch(/→ swarm/);
		expect(plan.steps.some((s) => s.kind === 'join')).toBe(true);
	});

	it('falls back to linear when nothing matches', () => {
		const cls = new TaskClassifier();
		const { auto } = buildRegistry(cls);
		const task: ITask = {
			id: 't',
			description: 'Medium-sized refactor across a couple of files.',
			tags: ['refactor'],
		};
		const plan = auto.plan(task, POLICY);
		expect(plan.rationale).toMatch(/→ linear/);
		expect(plan.steps.map((s) => s.kind)).toContain('spawn');
	});
});
