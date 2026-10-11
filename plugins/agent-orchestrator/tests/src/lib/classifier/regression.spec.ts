/**
 * Classifier regression — every verdict on a fixed 30-task fixture
 * set must remain stable across runs. The fixture lives next to the
 * test so it's part of the same code review.
 *
 * Update the expected verdicts only when the policy or classifier
 * genuinely changes; never to "make the test pass". When you do
 * change a verdict, the test diff IS the changelog.
 */
import { describe, it, expect } from 'vitest';

import { TaskClassifier } from '../../../../src/lib/classifier/task-classifier.js';
import type {
	ITask,
	OrchestrationMode,
} from '../../../../src/lib/policy/types.js';

interface IFixture {
	readonly id: string;
	readonly task: ITask;
	readonly expected: OrchestrationMode;
}

const POLICY = {
	defaultMode: 'auto' as const,
	defaults: {
		budget: {
			maxTokensOrchestrator: 0,
			maxTokensPerSubagent: 0,
			timeoutMs: 0,
		},
		rotation: {
			maxIterationsPerSubagent: 1,
			allow: ['error-storm' as const],
		},
	},
};

const FIXTURES: readonly IFixture[] = [
	{
		id: '01',
		task: {
			id: '01',
			description: 'Replace the typo.',
			tags: [],
			hint: 'trivial',
		},
		expected: 'single',
	},
	{
		id: '02',
		task: {
			id: '02',
			description: 'Add a unit test.',
			tags: [],
			hint: 'small',
		},
		expected: 'single',
	},
	{
		id: '03',
		task: {
			id: '03',
			description: 'Refactor cache layer.',
			tags: ['refactor'],
		},
		expected: 'linear',
	},
	{
		id: '04',
		task: { id: '04', description: 'Audit the repo.', tags: ['audit'] },
		expected: 'swarm',
	},
	{
		id: '05',
		task: {
			id: '05',
			description: 'Migrate the storage layer.',
			tags: [],
			hint: 'large',
		},
		expected: 'swarm',
	},
	{
		id: '06',
		task: {
			id: '06',
			description: 'Orchestrate the rollout.',
			tags: ['orchestrate'],
		},
		expected: 'swarm',
	},
	{
		id: '07',
		task: {
			id: '07',
			description: 'Fix the failing test in src/foo.spec.ts.',
			tags: [],
		},
		expected: 'single',
	},
	{
		id: '08',
		task: {
			id: '08',
			description: 'Implement the parser.',
			tags: ['feat'],
			hint: 'medium',
		},
		expected: 'linear',
	},
	{
		id: '09',
		task: {
			id: '09',
			description: 'Root-level rewrite of the bootstrap.',
			tags: ['root'],
		},
		expected: 'swarm',
	},
	{
		id: '10',
		task: { id: '10', description: 'Bump deps.', tags: [] },
		expected: 'single',
	},
	{
		id: '11',
		task: {
			id: '11',
			description: 'Refactor the dispatcher tests.',
			tags: ['refactor', 'tests'],
		},
		expected: 'linear',
	},
	{
		id: '12',
		task: {
			id: '12',
			description: 'Update the docs site.',
			tags: ['docs'],
		},
		expected: 'single',
	},
	{
		id: '13',
		task: {
			id: '13',
			description: 'Migrate from Vite 4 to Vite 5.',
			tags: ['migrate'],
		},
		expected: 'swarm',
	},
	{
		id: '14',
		task: {
			id: '14',
			description: 'Lint the codebase.',
			tags: [],
			hint: 'medium',
		},
		expected: 'linear',
	},
	{
		id: '15',
		task: {
			id: '15',
			description: 'Add a CLI command for the orphan reclaimer.',
			tags: ['cli'],
		},
		expected: 'single',
	},
	{
		id: '16',
		task: {
			id: '16',
			description: 'Investigate why the watchdog fires.',
			tags: ['investigate'],
		},
		expected: 'single',
	},
	{
		id: '17',
		task: {
			id: '17',
			description: 'Cross-cutting refactor of plugin entry points.',
			tags: [],
			hint: 'large',
		},
		expected: 'swarm',
	},
	{
		id: '18',
		task: {
			id: '18',
			description: 'Sketch a type for the new policy.',
			tags: [],
			hint: 'trivial',
		},
		expected: 'single',
	},
	{
		id: '19',
		task: {
			id: '19',
			description:
				'Long-running rewrite of the storage layer with deep schema changes, broken into many sub-tasks for multiple agents in parallel.',
			tags: ['swarm'],
		},
		expected: 'swarm',
	},
	{
		id: '20',
		task: {
			id: '20',
			description: 'Refactor + tests.',
			tags: ['refactor', 'tests'],
		},
		expected: 'linear',
	},
	{
		id: '21',
		task: {
			id: '21',
			description: 'Audit privacy surface.',
			tags: ['audit', 'privacy'],
		},
		expected: 'swarm',
	},
	{
		id: '22',
		task: { id: '22', description: 'Add a smoke test.', tags: ['smoke'] },
		expected: 'single',
	},
	{
		id: '23',
		task: {
			id: '23',
			description: 'Implement the rotation detector.',
			tags: ['feat', 'rot'],
			hint: 'medium',
		},
		expected: 'linear',
	},
	{
		id: '24',
		task: {
			id: '24',
			description: 'Implement a small refactor of the dispatcher.',
			tags: ['refactor'],
		},
		expected: 'linear',
	},
	{
		id: '25',
		task: {
			id: '25',
			description: 'Sketch the i18n keys.',
			tags: ['i18n'],
		},
		expected: 'single',
	},
	{
		id: '26',
		task: {
			id: '26',
			description: 'Cross-cutting migration to TypeScript 7.',
			tags: [],
			hint: 'large',
		},
		expected: 'swarm',
	},
	{
		id: '27',
		task: {
			id: '27',
			description: 'Update the dashboard header.',
			tags: [],
			hint: 'trivial',
		},
		expected: 'single',
	},
	{
		id: '28',
		task: {
			id: '28',
			description: 'Refactor the budget tracker.',
			tags: ['refactor'],
		},
		expected: 'linear',
	},
	{
		id: '29',
		task: {
			id: '29',
			description: 'Add a typed schema for the new tools.',
			tags: ['schema'],
		},
		expected: 'single',
	},
	{
		id: '30',
		task: {
			id: '30',
			description: 'Migrate the queue to the new event log format.',
			tags: ['migrate', 'queue'],
		},
		expected: 'swarm',
	},
];

describe('TaskClassifier — regression fixture set (S4)', () => {
	const cls = new TaskClassifier();
	for (const f of FIXTURES) {
		it(`fixture ${f.id} → ${f.expected}`, () => {
			const verdict = cls.classify(f.task, POLICY);
			expect(verdict.mode).toBe(f.expected);
		});
	}
});
