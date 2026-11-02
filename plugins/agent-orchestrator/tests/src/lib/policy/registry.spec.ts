import { describe, it, expect } from 'vitest';

import {
	DuplicateModeError,
	ModeRegistry,
	UnknownModeError,
} from '../../../../src/lib/policy/registry.js';
import type { IModeAdapter } from '../../../../src/lib/policy/registry.js';
import type {
	IModePlan,
	IOrchestratorPolicy,
	ITask,
	OrchestrationMode,
} from '../../../../src/lib/policy/types.js';

const POLICY: IOrchestratorPolicy = {
	defaultMode: 'auto',
	defaults: {
		budget: {
			maxTokensOrchestrator: 1000,
			maxTokensPerSubagent: 500,
			timeoutMs: 0,
		},
		rotation: { maxIterationsPerSubagent: 2, allow: ['error-storm'] },
	},
};

const stub: IModeAdapter = {
	id: 'single',
	accepts: () => true,
	plan: (task: ITask): IModePlan => ({
		mode: 'single',
		rationale: 'stub',
		steps: [
			{ order: 1, kind: 'orchestrate', instruction: task.description },
		],
		budget: POLICY.defaults.budget,
		rotation: POLICY.defaults.rotation,
	}),
};

describe('ModeRegistry', () => {
	it('registers and retrieves an adapter', () => {
		const r = new ModeRegistry();
		r.register(stub);
		expect(r.has('single')).toBe(true);
		expect(r.get('single')).toBe(stub);
	});

	it('throws DuplicateModeError on second registration', () => {
		const r = new ModeRegistry();
		r.register(stub);
		expect(() => r.register(stub)).toThrow(DuplicateModeError);
	});

	it('throws UnknownModeError on missing id', () => {
		const r = new ModeRegistry();
		expect(() => r.get('swarm' as OrchestrationMode)).toThrow(
			UnknownModeError,
		);
	});

	it('throws on invalid adapter (no id)', () => {
		const r = new ModeRegistry();
		expect(() =>
			r.register({ ...stub, id: '' as OrchestrationMode }),
		).toThrow(TypeError);
	});

	it('list() returns registered adapters in insertion order', () => {
		const r = new ModeRegistry();
		const a: IModeAdapter = { ...stub, id: 'linear' };
		const b: IModeAdapter = { ...stub, id: 'swarm' };
		r.register(a);
		r.register(b);
		expect(r.list().map((m) => m.id)).toEqual(['linear', 'swarm']);
	});
});
