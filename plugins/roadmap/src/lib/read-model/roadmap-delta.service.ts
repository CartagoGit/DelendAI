import { buildBumpIntent } from '../bump/roadmap-bump-intent.service';
import { ROADMAP_WITHDRAWN_STATES } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmapHorizonDelta,
	IRoadmapHorizonReadiness,
} from '../contracts/interfaces/read-model.interface';
import type { IRoadmapHorizon } from '../contracts/interfaces/roadmap.interface';

const nextActionOf = (
	horizon: IRoadmapHorizon,
	open: readonly string[],
	published: boolean | null,
	readiness: IRoadmapHorizonReadiness,
): string => {
	if (published === true) {
		return open.length === 0
			? `nothing: ${horizon.version} is published with everything it promised`
			: `record what ${horizon.version} shipped without: mark ${open.join(', ')} as deferred, dropped or superseded`;
	}
	if (readiness.status === 'not-ready') {
		return `deliver, or withdraw with a reason: ${readiness.blockers.map((each) => each.entryId).join(', ')}`;
	}
	if (readiness.status === 'unknown') {
		return `gather the evidence for: ${readiness.unverified.map((each) => each.entryId).join(', ')}`;
	}
	return `promote: ${readiness.reason}`;
};

/**
 * The three columns of a horizon — what it still promises, what of that
 * is delivered, whether the version is out — with the bump its promises
 * imply (and who decides the real one) and the one thing to do next.
 */
export const horizonDelta = (
	horizon: IRoadmapHorizon,
	readiness: IRoadmapHorizonReadiness,
	published: boolean | null,
): IRoadmapHorizonDelta => {
	const promised = horizon.entries.filter(
		(entry) =>
			!(ROADMAP_WITHDRAWN_STATES as readonly string[]).includes(
				entry.state,
			),
	);
	const delivered = promised.filter((entry) => entry.state === 'delivered');
	const open = promised
		.filter((entry) => entry.state !== 'delivered')
		.map((entry) => entry.id);
	const intent = buildBumpIntent(horizon);
	return {
		version: horizon.version,
		declared: promised.map((entry) => entry.id),
		delivered: delivered.map((entry) => entry.id),
		published,
		bump: {
			kind: intent.kind,
			authority: intent.authority,
			...(intent.declared === undefined
				? {}
				: { declared: intent.declared }),
			coherent: intent.coherent,
		},
		nextAction: nextActionOf(horizon, open, published, readiness),
	};
};

/** The leading numeric parts of a version, or nothing when it has none. */
const numericParts = (version: string): readonly number[] | undefined => {
	const parts = version.replace(/^v/u, '').split(/[.+-]/u).slice(0, 3);
	const numbers = parts.map(Number);
	return parts.length > 0 && numbers.every((part) => Number.isInteger(part))
		? numbers
		: undefined;
};

/**
 * Whether `horizonVersion` is out, given the version the project is at:
 * it is when the project's version has reached it. `null` when either
 * cannot be read as numbers — nobody can say, and that is not "no".
 */
export const isPublished = (
	horizonVersion: string,
	currentVersion: string | undefined,
): boolean | null => {
	if (currentVersion === undefined) return null;
	const wanted = numericParts(horizonVersion);
	const have = numericParts(currentVersion);
	if (wanted === undefined || have === undefined) return null;
	for (
		let index = 0;
		index < Math.max(wanted.length, have.length);
		index += 1
	) {
		const difference = (have[index] ?? 0) - (wanted[index] ?? 0);
		if (difference !== 0) return difference > 0;
	}
	return true;
};
