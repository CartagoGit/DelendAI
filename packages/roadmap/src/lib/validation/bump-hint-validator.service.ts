import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmapBumpDeriver,
	IRoadmapEntryKind,
	IRoadmapHorizon,
} from '../contracts/interfaces/roadmap.interface';

/** The kinds of the entries a horizon still promises. */
export const promisedKinds = (
	horizon: IRoadmapHorizon,
): readonly IRoadmapEntryKind[] =>
	horizon.entries
		.filter(
			(entry) =>
				!(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(
					entry.state,
				),
		)
		.map((entry) => entry.kind);

/**
 * Problems with the bump a horizon declares, one message each. The bump
 * the kinds imply comes from `deriveBump`, so this holds no rule of its
 * own about what a kind costs in version number. A horizon with no
 * `bumpHint` declares nothing and cannot contradict itself.
 */
export const validateBumpHints = (
	horizons: readonly IRoadmapHorizon[],
	deriveBump: IRoadmapBumpDeriver,
): readonly string[] =>
	horizons.flatMap((horizon) => {
		if (horizon.bumpHint === undefined) return [];
		const implied = deriveBump(promisedKinds(horizon));
		if (implied === horizon.bumpHint) return [];
		return [
			`horizon ${horizon.version} declares bumpHint ${horizon.bumpHint} but its entries imply ${implied}; change the hint or the entries`,
		];
	});
