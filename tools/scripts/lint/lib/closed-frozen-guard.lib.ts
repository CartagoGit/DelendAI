/**
 * closed-frozen-guard.lib.ts — f00076 S3.
 *
 * Pure functions that detect drift in `legacy/closed/<kind>/`. Drift
 * means an archived proposal's frontmatter or body has changed since
 * archival, breaking the freeze. The script (closed-frozen-guard.script.ts)
 * turns the drift list into a CI gate (exit 1 when any drift is found).
 *
 * The four drift kinds:
 *   - `[missing-archived-on]` — `archived-on:` frontmatter is missing.
 *   - `[status-drift]` — `status:` is no longer `done`.
 *   - `[mtime-drift]` — file mtime is newer than `archived-on:` + 1 minute.
 *   - `[slice-drift]` — any `### S<n>` `**Status**:` has changed since
 *     archival (compared against the snapshot in `<file>.archive-snapshot.json`,
 *     sidecar produced by the S2 reaper's `--apply`).
 *
 * Pure functions only — the script handles I/O. This split is what lets
 * the unit spec run without a tempdir.
 */

import { collectSliceStatuses } from '../../../../plugins/proposals/src/lib/services/proposal-completeness';
import type { ISliceParse } from '../../../../plugins/proposals/src/lib/services/proposal-completeness';

export type FrozenDriftCode =
	| 'missing-archived-on'
	| 'status-drift'
	| 'mtime-drift'
	| 'slice-drift';

export interface IFrozenDrift {
	readonly id: string;
	readonly code: FrozenDriftCode;
	readonly detail: string;
	readonly fix: string;
}

export interface IFrozenInputs {
	/** Path-proposal-relative (`legacy/closed/feats/f00100.md`) */
	readonly relPath: string;
	readonly id: string;
	/** Parsed frontmatter. `archivedOn` is the ISO date from `archived-on:`. */
	readonly status: string | undefined;
	readonly archivedOn: string | undefined;
	/** File mtime, ISO string. */
	readonly mtimeIso: string;
	/** Full markdown body. */
	readonly markdown: string;
	/**
	 * Slice statuses at archival time, recorded by the S2 reaper in
	 * `<file>.archive-snapshot.json`. Empty when no snapshot exists.
	 */
	readonly snapshotSlices: ReadonlyArray<ISliceParse>;
}

/** mtime newer than archived-on (with a 60s grace window for write latency). */
const ARCHIVAL_MTIME_GRACE_MS = 60_000;

const isMtimeDrift = (
	archivedOn: string,
	mtimeIso: string,
	now: Date = new Date(),
): boolean => {
	const archivedMs = Date.parse(archivedOn);
	const mtimeMs = Date.parse(mtimeIso);
	if (Number.isNaN(archivedMs) || Number.isNaN(mtimeMs)) return true;
	// Treat mtime newer than archivedOn + grace as drift.
	return mtimeMs > archivedMs + ARCHIVAL_MTIME_GRACE_MS;
};

/** Pure: produce the drift list for one proposal. */
export const detectFrozenDrift = (
	input: IFrozenInputs,
): ReadonlyArray<IFrozenDrift> => {
	const drifts: IFrozenDrift[] = [];
	if (input.archivedOn === undefined || input.archivedOn === '') {
		drifts.push({
			id: input.id,
			code: 'missing-archived-on',
			detail: '`archived-on:` frontmatter is missing',
			fix: 'add `archived-on: <today>` (or run `bun tools/scripts/lint/reap-legacy-proposals.script.ts --apply` to re-archive and re-stamp)',
		});
		return drifts;
	}
	if (input.status !== 'done') {
		drifts.push({
			id: input.id,
			code: 'status-drift',
			detail: `status is "${input.status ?? '<missing>'}", expected "done"`,
			fix: `revert status to done (legacy/closed/ freezes the workflow state at archival)`,
		});
	}
	if (isMtimeDrift(input.archivedOn, input.mtimeIso)) {
		drifts.push({
			id: input.id,
			code: 'mtime-drift',
			detail: `file mtime (${input.mtimeIso}) is newer than archived-on (${input.archivedOn})`,
			fix: 'revert the body to the archived state (legacy/closed/ freezes the proposal body)',
		});
	}
	if (input.snapshotSlices.length > 0) {
		const currentSlices = collectSliceStatuses(input.markdown);
		const snapshotById = new Map(
			input.snapshotSlices.map((s) => [s.id, s.status]),
		);
		const changed: string[] = [];
		for (const current of currentSlices) {
			const snapStatus = snapshotById.get(current.id);
			if (snapStatus !== undefined && snapStatus !== current.status) {
				changed.push(`${current.id}: ${snapStatus}→${current.status}`);
			}
		}
		if (changed.length > 0) {
			drifts.push({
				id: input.id,
				code: 'slice-drift',
				detail: `slice statuses changed since archival: ${changed.join(', ')}`,
				fix: 'revert slice statuses to the snapshot in `<file>.archive-snapshot.json`',
			});
		}
	}
	return drifts;
};

/** One-line drift report, mirrors `reap-legacy-proposals` style. */
export const formatDriftLine = (drift: IFrozenDrift): string => {
	return `${drift.id}: [${drift.code}] ${drift.detail} — fix: ${drift.fix}`;
};
