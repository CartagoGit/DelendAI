/**
 * recommend-plugins.ts — f00142 S1: the pure plugin-fit scorer.
 *
 * Given the project shape (`IProjectSignals`) and a list of
 * candidate plugins (`IPluginCandidate[]`), score every candidate
 * against the signals and return a ranked `IPluginFit[]`. The
 * scoring is fully deterministic, has no fs / network / subprocess
 * dependencies, and is unit-testable on fixture project shapes.
 *
 * Scoring rules (per candidate):
 *
 *  - **Pack bonus**: when the candidate's tags include the signal's
 *    `pack` value, contribute `+1`.
 *  - **Language bonus**: when the candidate's tags intersect with
 *    `signals.languages`, contribute `+0.5` per matching language.
 *  - **Project-shape bonus**: `hasDocsSite` matches `docs-site`;
 *    `isCliTool` matches `cli`; `hasBackend` matches `backend`;
 *    `hasTests` matches `tests`. Each contributes `+0.5`.
 *  - **Penalty**: every tag on the candidate that matched nothing
 *    contributes `-0.05` (mild so it doesn't crush a candidate with
 *    mostly-fitting tags and one stray tag).
 *
 * Aggregation:
 *  - Normalize so the top plugin always scores `1.0`. Others are
 *    `rawScore / topRawScore`.
 *  - Sort by `fitScore` DESC; ties broken by `id` ASC.
 *  - Apply `minScore` (default `0`) then `limit` (default
 *    `candidates.length`).
 */
import type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
} from '../contracts/interfaces/plugin-fit.interface';

export type {
	IPluginCandidate,
	IPluginFit,
	IProjectSignals,
	IRecommendPluginsOptions,
} from '../contracts/interfaces/plugin-fit.interface';

const PACK_BONUS = 1;
const LANGUAGE_BONUS = 0.5;
const SHAPE_BONUS = 0.5;
const UNMATCHED_PENALTY = -0.05;

const SHAPE_MAP: Readonly<
	Record<
		keyof Pick<
			IProjectSignals,
			'hasDocsSite' | 'isCliTool' | 'hasBackend' | 'hasTests'
		>,
		string
	>
> = {
	hasDocsSite: 'docs-site',
	isCliTool: 'cli',
	hasBackend: 'backend',
	hasTests: 'tests',
};

const scoreOne = (
	signals: IProjectSignals,
	candidate: IPluginCandidate,
): { raw: number; reasons: string[]; unmatched: string[] } => {
	const reasons = new Set<string>();
	const matchedTags = new Set<string>();
	let raw = 0;

	// Pack bonus
	if (candidate.tags.includes(signals.pack)) {
		raw += PACK_BONUS;
		reasons.add(`pack:${signals.pack}`);
		matchedTags.add(signals.pack);
	}

	// Language bonus
	const langSet = new Set(signals.languages);
	for (const tag of candidate.tags) {
		if (langSet.has(tag)) {
			raw += LANGUAGE_BONUS;
			reasons.add(`language:${tag}`);
			matchedTags.add(tag);
		}
	}

	// Project-shape bonus
	for (const [field, tag] of Object.entries(SHAPE_MAP)) {
		if (signals[field as keyof typeof SHAPE_MAP] === true) {
			if (candidate.tags.includes(tag)) {
				raw += SHAPE_BONUS;
				reasons.add(`${field}:${tag}`);
				matchedTags.add(tag);
			}
		}
	}

	// Unmatched penalty
	const unmatched: string[] = [];
	for (const tag of candidate.tags) {
		if (!matchedTags.has(tag)) {
			raw += UNMATCHED_PENALTY;
			unmatched.push(tag);
		}
	}

	return {
		raw,
		reasons: [...reasons].sort(),
		unmatched: unmatched.sort(),
	};
};

/**
 * Rank every candidate against the project signals. See the file
 * header for the scoring rules. Pure: no I/O, no clock, no random.
 */
export const recommendPlugins = (
	signals: IProjectSignals,
	candidates: readonly IPluginCandidate[],
	options: IRecommendPluginsOptions = {},
): readonly IPluginFit[] => {
	const limit = options.limit ?? candidates.length;
	const minScore = options.minScore ?? 0;

	// Score every candidate; collect raw scores for normalization.
	const scored = candidates.map((plugin) => {
		const { raw, reasons, unmatched } = scoreOne(signals, plugin);
		return { plugin, raw, reasons, unmatched };
	});

	// Top raw score drives normalization (top = 1.0). When every
	// candidate scored <= 0 the result is an empty array — there is
	// no positive top to normalize against.
	const topRaw = Math.max(0, ...scored.map((s) => s.raw));
	if (topRaw === 0) return [];

	const normalized: IPluginFit[] = scored
		.map(({ plugin, raw, reasons, unmatched }) => ({
			plugin,
			fitScore: raw <= 0 ? 0 : raw / topRaw,
			reasons,
			unmatchedTags: unmatched,
		}))
		.filter((fit) => fit.fitScore >= minScore)
		.sort((a, b) => {
			if (a.fitScore !== b.fitScore) return b.fitScore - a.fitScore;
			return a.plugin.id.localeCompare(b.plugin.id);
		})
		.slice(0, limit);

	return normalized;
};
