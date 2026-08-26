/**
 * Task classifier — pure heuristic that maps a task to a routing
 * verdict (`single` | `linear` | `swarm`). The `auto` mode delegates
 * to this; other modes ignore it.
 *
 * Heuristics, in order:
 *
 *   1. Honour the explicit `hint` if the host supplied one.
 *   2. Tag scan: `swarm`/`large` → `swarm`; `orchestrate`/`root` → `swarm`.
 *   3. Keyword scan: "audit", "migrate", "refactor" → `linear`.
 *   4. Description size: ≤ `SINGLE_THRESHOLD` chars → `single`.
 *   5. Default → `linear`.
 *
 * Pure: same input ⇒ same output. No I/O, no clock. Trivially testable.
 */
import type {
	IOrchestratorPolicy,
	ITask,
	OrchestrationMode,
} from '../policy/types.js';

export interface IClassificationVerdict {
	readonly mode: OrchestrationMode;
	readonly reason: string;
	/** Confidence 0..1 — surfaced so the executor can log it. */
	readonly confidence: number;
}

const SWARM_TAGS: ReadonlySet<string> = new Set(['swarm', 'root']);
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

export class TaskClassifier {
	classify(
		task: ITask,
		_policy: IOrchestratorPolicy,
	): IClassificationVerdict {
		if (task.hint === 'trivial' || task.hint === 'small') {
			return {
				mode: 'single',
				reason: `explicit hint "${task.hint ?? 'unknown'}" routes to single`,
				confidence: 0.9,
			};
		}
		if (task.hint === 'medium') {
			return {
				mode: 'linear',
				reason: 'explicit hint "medium" routes to linear',
				confidence: 0.8,
			};
		}
		if (task.hint === 'large') {
			return {
				mode: 'swarm',
				reason: 'explicit hint "large" routes to swarm',
				confidence: 0.95,
			};
		}

		const lowerTags = task.tags.map((t) => t.toLowerCase());
		if (lowerTags.some((t) => SWARM_TAGS.has(t))) {
			return {
				mode: 'swarm',
				reason: `tag(s) ${lowerTags.filter((t) => SWARM_TAGS.has(t)).join(',')} route to swarm`,
				confidence: 0.8,
			};
		}

		const description = task.description.toLowerCase();
		for (const keyword of SWARM_KEYWORDS) {
			if (description.includes(keyword)) {
				return {
					mode: 'swarm',
					reason: `description mentions "${keyword}"`,
					confidence: 0.6,
				};
			}
		}

		if (lowerTags.some((t) => LINEAR_TAGS.has(t))) {
			return {
				mode: 'linear',
				reason: `tag(s) ${lowerTags.filter((t) => LINEAR_TAGS.has(t)).join(',')} route to linear`,
				confidence: 0.7,
			};
		}

		if (task.description.length <= SINGLE_THRESHOLD) {
			return {
				mode: 'single',
				reason: `description length ${task.description.length} ≤ ${SINGLE_THRESHOLD}`,
				confidence: 0.55,
			};
		}

		return {
			mode: 'linear',
			reason: 'default fallback to linear',
			confidence: 0.4,
		};
	}
}
