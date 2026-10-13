/**
 * Task classifier — legacy routing compatibility backed by the canonical
 * execution decision.
 *
 * The package still exposes a `single | linear | swarm` verdict because the
 * mode adapters and telemetry already speak that language. What changed in
 * f00503 is WHERE that verdict comes from: one `ExecutionDecision` is built
 * first, then this classifier derives the runnable mode from it.
 *
 * The old hints/tags/keywords remain deliberately intact as compatibility
 * inputs. They now enrich the decision instead of bypassing it, so the system
 * keeps one canonical judgement while preserving the routing the existing
 * regression suite already promised to callers.
 */
import type {
	IOrchestratorPolicy,
	ITask,
	OrchestrationMode,
} from '../policy/types.js';
import {
	resolveExecutionMode,
	type IDelegationCandidate,
} from '../policy/decision-to-plan.js';
import type { IExecutionDecision } from '../policy/execution-decision.contract.js';
import { classifyObservedTask } from './ceremony-classifier.js';

export interface IClassificationVerdict {
	readonly mode: OrchestrationMode;
	readonly reason: string;
	readonly confidence: number;
	readonly decision?: IExecutionDecision | undefined;
}

const SWARM_TAGS: ReadonlySet<string> = new Set([
	'swarm',
	'root',
	'audit',
	'orchestrate',
	'migrate',
]);

const SWARM_KEYWORDS: readonly string[] = [
	'entire codebase',
	'across the repo',
	'global refactor',
	'audit',
	'migrate',
	'orchestrate',
];

const LINEAR_TAGS: ReadonlySet<string> = new Set(['refactor', 'fix-slice']);

const SINGLE_THRESHOLD = 280;

const subsystemOf = (file: string): string => {
	const [first = '', second = ''] = file.split('/');
	return first === 'plugins' || first === 'packages'
		? `${first}/${second}`
		: first;
};

const delegationCandidateFor = (
	task: ITask,
): IDelegationCandidate | undefined => {
	const explicitParts = task.facts?.parts;
	const declaredParts =
		typeof explicitParts === 'number' && explicitParts > 0
			? Math.floor(explicitParts)
			: undefined;
	const files = task.files ?? [];
	const areas = new Set(
		files.map(subsystemOf).filter((value: string) => value.length > 0),
	);
	const inferredParts = Math.max(declaredParts ?? 1, areas.size);
	if (inferredParts <= 1) return undefined;
	const explicitDisjointness = task.facts?.disjointness;
	const disjointness =
		typeof explicitDisjointness === 'number'
			? explicitDisjointness
			: Math.min(1, areas.size / Math.max(files.length, inferredParts));
	return {
		parts: inferredParts,
		disjointness,
		requestedByUser: task.facts?.requestedDelegation === true,
	};
};

const budgetsForCeremony = (
	ceremony: IExecutionDecision['ceremony'],
	existing: IExecutionDecision['budgets'],
): IExecutionDecision['budgets'] => {
	if (ceremony === 'proposal') {
		return {
			maxConcurrentAgents: Math.max(existing.maxConcurrentAgents, 3),
			reviewQuorum: Math.max(existing.reviewQuorum, 2),
			maxMinutes: Math.max(existing.maxMinutes, 120),
		};
	}
	if (ceremony === 'light-plan') {
		return {
			maxConcurrentAgents: Math.max(existing.maxConcurrentAgents, 1),
			reviewQuorum: Math.max(existing.reviewQuorum, 1),
			maxMinutes: Math.max(existing.maxMinutes, 45),
		};
	}
	return {
		maxConcurrentAgents: 1,
		reviewQuorum: 1,
		maxMinutes: Math.min(existing.maxMinutes, 30),
	};
};

const withLegacyRouting = (
	task: ITask,
	decision: IExecutionDecision,
): IExecutionDecision => {
	const lowerTags = task.tags.map((tag) => tag.toLowerCase());
	const description = task.description.toLowerCase();

	if (task.hint === 'trivial' || task.hint === 'small') {
		return {
			...decision,
			ceremony: 'direct',
			execution: 'single',
			context: 'minimal',
			validation: 'targeted',
			response: 'terse',
			budgets: budgetsForCeremony('direct', decision.budgets),
			confidence: Math.max(decision.confidence, 0.9),
			reasons: [
				{
					code: 'legacy-hint-direct',
					direction: 'toward-directness',
					weight: 1,
					detail: `explicit hint "${task.hint}" routes to direct work`,
				},
				...decision.reasons,
			],
		};
	}

	if (
		task.hint === 'medium' ||
		lowerTags.some((tag) => LINEAR_TAGS.has(tag))
	) {
		return {
			...decision,
			ceremony: 'light-plan',
			execution: 'linear',
			context: 'focused',
			validation: 'package',
			response: 'normal',
			budgets: budgetsForCeremony('light-plan', decision.budgets),
			confidence: Math.max(
				decision.confidence,
				task.hint === 'medium' ? 0.8 : 0.7,
			),
			reasons: [
				{
					code:
						task.hint === 'medium'
							? 'legacy-hint-medium'
							: 'legacy-refactor-linear',
					direction: 'toward-ceremony',
					weight: task.hint === 'medium' ? 0.8 : 0.7,
					detail:
						task.hint === 'medium'
							? 'explicit medium hint routes to the delegated linear path'
							: 'refactor-style work stays on the linear delegated path',
				},
				...decision.reasons,
			],
		};
	}

	if (
		task.hint === 'large' ||
		lowerTags.some((tag) => SWARM_TAGS.has(tag)) ||
		SWARM_KEYWORDS.some((keyword) => description.includes(keyword))
	) {
		return {
			...decision,
			ceremony: 'proposal',
			execution: 'swarm',
			context: 'broad',
			validation: 'full',
			response: 'detailed',
			budgets: budgetsForCeremony('proposal', decision.budgets),
			confidence: Math.max(
				decision.confidence,
				task.hint === 'large' ? 0.95 : 0.8,
			),
			reasons: [
				{
					code:
						task.hint === 'large'
							? 'legacy-hint-large'
							: 'legacy-swarm-routing',
					direction: 'toward-ceremony',
					weight: task.hint === 'large' ? 0.95 : 0.8,
					detail:
						task.hint === 'large'
							? 'explicit large hint routes to swarm'
							: 'legacy swarm keywords or tags still require the swarm path',
				},
				...decision.reasons,
			],
		};
	}

	if (task.description.length > SINGLE_THRESHOLD) {
		return {
			...decision,
			ceremony: 'light-plan',
			execution: 'linear',
			context: 'focused',
			validation: 'package',
			response: 'normal',
			budgets: budgetsForCeremony('light-plan', decision.budgets),
			confidence: Math.max(decision.confidence, 0.4),
			reasons: [
				{
					code: 'legacy-long-description',
					direction: 'toward-ceremony',
					weight: 0.4,
					detail: `description length ${task.description.length.toString()} exceeds ${SINGLE_THRESHOLD.toString()}`,
				},
				...decision.reasons,
			],
		};
	}

	return decision;
};

export class TaskClassifier {
	classify(task: ITask, policy: IOrchestratorPolicy): IClassificationVerdict {
		const decision = withLegacyRouting(
			task,
			classifyObservedTask({
				description: task.description,
				files: task.files ?? [],
				tags: task.tags,
				facts: {
					...(task.facts ?? {}),
					...(task.hint === undefined ? {} : { hint: task.hint }),
				},
			}),
		);

		const resolution = resolveExecutionMode(
			decision,
			policy.delegationMode ?? 'adaptive',
			delegationCandidateFor(task),
		);

		return {
			mode: resolution.mode,
			reason: `${resolution.reason}; reasons=${decision.reasons.map((reason) => reason.code).join(',')}`,
			confidence: decision.confidence,
			decision,
		};
	}
}
