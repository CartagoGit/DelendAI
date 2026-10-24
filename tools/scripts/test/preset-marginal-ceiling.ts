/**
 * preset-marginal-ceiling.ts — whether one plugin costs more than its
 * preset allows, decided once.
 *
 * WHY this exists: the dashboard reported `standard` as
 * `over hard (11,000B)` — `agent-orchestrator` at 11,167 B — while
 * `tokens:gate` exited 0, because the gate read the marginal ceiling and
 * never compared anything with it. Two places deciding the same question
 * is how they came to disagree, so both now ask this one.
 */
import type {
	IMarginalCeiling,
	IMarginalVerdict,
	IOwnerBytes,
} from './preset-marginal-ceiling.interface';

export type {
	IMarginalCeiling,
	IMarginalVerdict,
	IOwnerBytes,
} from './preset-marginal-ceiling.interface';

/** Core is the bootstrap roster, governed by the preset total, not a plugin. */
const CORE_OWNER = 'core';

/** The plugin that contributes the most bytes, or `undefined` if none does. */
export const heaviestPlugin = (
	rows: readonly IOwnerBytes[],
): IOwnerBytes | undefined =>
	rows
		.filter((row) => row.owner !== CORE_OWNER)
		.reduce<IOwnerBytes | undefined>(
			(top, row) =>
				top === undefined || row.toolsListBytes > top.toolsListBytes
					? row
					: top,
			undefined,
		);

export const marginalVerdict = (
	rows: readonly IOwnerBytes[],
	ceiling: IMarginalCeiling,
): IMarginalVerdict => {
	const heaviest = heaviestPlugin(rows);
	if (heaviest === undefined) return { kind: 'no-plugins' };
	const measured = {
		owner: heaviest.owner,
		bytes: heaviest.toolsListBytes,
		ceiling,
	};
	if (heaviest.toolsListBytes > ceiling.hard) {
		return { kind: 'over-hard', ...measured };
	}
	if (heaviest.toolsListBytes > ceiling.warning) {
		return { kind: 'over-warning', ...measured };
	}
	return { kind: 'within', ...measured };
};
