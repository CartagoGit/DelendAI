import { describe, it, expect } from 'vitest';

import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import type {
	IOrchestratorPolicy,
	ITask,
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

const cls = new TaskClassifier();

describe('TaskClassifier', () => {
	it('routes explicit trivial/small hint to single', () => {
		const task: ITask = {
			id: 't',
			description: 'whatever',
			tags: [],
			hint: 'trivial',
		};
		expect(cls.classify(task, POLICY).mode).toBe('single');
	});

	it('routes explicit large hint to swarm', () => {
		const task: ITask = {
			id: 't',
			description: 'whatever',
			tags: [],
			hint: 'large',
		};
		expect(cls.classify(task, POLICY).mode).toBe('swarm');
	});

	it('routes swarm tag to swarm', () => {
		const task: ITask = { id: 't', description: 'x', tags: ['swarm'] };
		expect(cls.classify(task, POLICY).mode).toBe('swarm');
	});

	it('routes `audit` keyword to swarm', () => {
		const task: ITask = {
			id: 't',
			description: 'Audit the storage layer',
			tags: [],
		};
		expect(cls.classify(task, POLICY).mode).toBe('swarm');
	});

	it('routes refactor tag to linear', () => {
		const task: ITask = { id: 't', description: 'x', tags: ['refactor'] };
		expect(cls.classify(task, POLICY).mode).toBe('linear');
	});

	it('routes a short description with no tags to single', () => {
		const task: ITask = { id: 't', description: 'Fix typo', tags: [] };
		expect(cls.classify(task, POLICY).mode).toBe('single');
	});

	it('falls back to linear for long undescribed tasks', () => {
		const task: ITask = {
			id: 't',
			description: 'x'.repeat(500),
			tags: [],
		};
		expect(cls.classify(task, POLICY).mode).toBe('linear');
	});
});
