/**
 * proposal-parallelism.ts
 *
 * Runtime evaluation of the "one main write lane at a time" rule.
 * Proposal parallelism enforcement.
 *
 * A proposal declares its `mainWriteLane` (the primary track the slice is
 * writing to) and `parallelismLanes` (the tracks it tolerates running in
 * parallel with itself). Two proposals on DIFFERENT lanes are compatible
 * iff the other lane appears in this lane's `parallelismLanes`. Audit is
 * a carve-out: it is parallel-friendly with any other lane by default
 * (read-mostly by construction).
 *
 * Two proposals on the SAME non-audit lane are always a block violation:
 * only one main write lane per track.
 *
 * Severity policy:
 *   block — same `mainWriteLane` in flight, OR the lane-pair is
 *           declared mutually exclusive;
 *   warn  — audit lane overlaps with a non-audit lane that does not
 *           explicitly list audit in its `parallelismLanes` (soft).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A proposal track (write lane). Mirrors the `track` field of
 * `IProposalFrontmatter`. The vocabulary is host-defined — mcp-vertex is
 * agnostic, so this is an open `string`, not a closed union baked with
 * one host's tracks. A host that wants typo-guarding passes its own set
 * of known tracks to `extractParallelismFromFrontmatter`. [M4]
 */
export type IProposalTrack = string;

/**
 * The conventional audit carve-out lane. A host may override the
 * carve-out set when calling `evaluateParallelism`; this is only the
 * default so existing single-audit-lane setups keep working.
 */
export const DEFAULT_AUDIT_LANES: ReadonlySet<string> = new Set(['audit']);

/**
 * The lane declaration a proposal carries in its frontmatter.
 */
export interface IProposalParallelism {
	readonly proposalId: string;
	readonly mainWriteLane: IProposalTrack;
	readonly parallelismLanes: readonly IProposalTrack[];
}

export type IParallelismViolationSeverity = 'block' | 'warn';

export interface IParallelismViolation {
	readonly field: string;
	readonly severity: IParallelismViolationSeverity;
	readonly message: string;
	readonly conflictingProposals: readonly string[];
}

export interface IParallelismResult {
	readonly withinPolicy: boolean;
	readonly violations: readonly IParallelismViolation[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const makeIsAuditLane =
	(auditLanes: ReadonlySet<string>) =>
	(lane: IProposalTrack): boolean =>
		auditLanes.has(lane);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the parallelism policy for the set of currently active
 * proposals (those with `status: in_progress` in `index.json`).
 *
 * Returns a structured result with:
 *   - one block violation per `mainWriteLane` that has > 1 member
 *     (audit is exempt: it is a carve-out, never a block);
 *   - one block or warn violation per **pair of distinct lanes** with
 *     members that are mutually exclusive. Each pair is reported once.
 */
export const evaluateParallelism = (
	actives: readonly IProposalParallelism[],
	auditLanes: ReadonlySet<string> = DEFAULT_AUDIT_LANES
): IParallelismResult => {
	if (actives.length === 0) {
		return { withinPolicy: true, violations: [] };
	}

	const isAuditLane = makeIsAuditLane(auditLanes);
	const violations: IParallelismViolation[] = [];

	// Group by mainWriteLane.
	const byLane = new Map<IProposalTrack, IProposalParallelism[]>();
	for (const lane of actives) {
		const bucket = byLane.get(lane.mainWriteLane) ?? [];
		bucket.push(lane);
		byLane.set(lane.mainWriteLane, bucket);
	}

	// 1) Lane-bucket violations: > 1 member on a non-audit lane.
	for (const [laneId, members] of byLane) {
		if (members.length <= 1) {
			continue;
		}
		if (isAuditLane(laneId)) {
			// Audit is a carve-out: never a block, even with N members.
			continue;
		}
		violations.push({
			field: 'mainWriteLane',
			severity: 'block',
			message: `${members.length} proposals in flight on lane "${laneId}" — only one main write lane is allowed at a time.`,
			conflictingProposals: members.map((m) => m.proposalId).sort(),
		});
	}

	// 2) Pairwise: distinct lanes that are mutually exclusive (or audit
	//    overlap that is not explicitly permitted). Each pair reported
	//    once. Sort lane ids so the pair key is deterministic.
	const laneIds = [...byLane.keys()].sort();
	for (let i = 0; i < laneIds.length; i += 1) {
		for (let j = i + 1; j < laneIds.length; j += 1) {
			const laneA = laneIds[i];
			const laneB = laneIds[j];
			if (!laneA || !laneB) {
				continue;
			}
			const membersA = byLane.get(laneA) ?? [];
			const membersB = byLane.get(laneB) ?? [];
			const aIsAudit = isAuditLane(laneA);
			const bIsAudit = isAuditLane(laneB);

			// Both audit: no conflict, both are carve-outs.
			if (aIsAudit && bIsAudit) {
				continue;
			}

			// One is audit, the other is not: the non-audit side must
			// permit audit in its parallelismLanes; otherwise warn.
			if (aIsAudit !== bIsAudit) {
				const nonAuditMembers = aIsAudit ? membersB : membersA;
				const auditMembers = aIsAudit ? membersA : membersB;
				const nonAuditPermitsAudit = nonAuditMembers.every((m) =>
					m.parallelismLanes.includes('audit')
				);
				if (nonAuditPermitsAudit) {
					continue;
				}
				const ref = nonAuditMembers[0];
				if (!ref) {
					continue;
				}
				violations.push({
					field: 'parallelismLanes',
					severity: 'warn',
					message: `Lane "${ref.mainWriteLane}" (${ref.proposalId}) overlaps with audit lanes (${auditMembers.map((m) => m.proposalId).join(', ')}) without explicit "audit" permission.`,
					conflictingProposals: [
						...nonAuditMembers.map((m) => m.proposalId),
						...auditMembers.map((m) => m.proposalId),
					]
						.filter((v, idx, arr) => arr.indexOf(v) === idx)
						.sort(),
				});
				continue;
			}

			// If either lane already emitted a lane-bucket violation, the
			// pairwise conflict is implied — skip to avoid duplicate reports.
			const aBucketReported = membersA.length > 1 && !aIsAudit;
			const bBucketReported = membersB.length > 1 && !bIsAudit;
			if (aBucketReported || bBucketReported) {
				continue;
			}

			// Two non-audit distinct lanes: report one block per pair.
			const refA = membersA[0];
			const refB = membersB[0];
			if (!refA || !refB) {
				continue;
			}
			const aPermitsB = refA.parallelismLanes.includes(laneB);
			const bPermitsA = refB.parallelismLanes.includes(laneA);
			if (aPermitsB && bPermitsA) {
				continue;
			}
			violations.push({
				field: 'parallelismLanes',
				severity: 'block',
				message: `Lanes "${laneA}" (${membersA.map((m) => m.proposalId).join(', ')}) and "${laneB}" (${membersB.map((m) => m.proposalId).join(', ')}) are mutually exclusive.`,
				conflictingProposals: [
					...membersA.map((m) => m.proposalId),
					...membersB.map((m) => m.proposalId),
				]
					.filter((v, idx, arr) => arr.indexOf(v) === idx)
					.sort(),
			});
		}
	}

	const sorted = [...violations].sort((a, b) => {
		const sev =
			(a.severity === 'block' ? 0 : 1) - (b.severity === 'block' ? 0 : 1);
		if (sev !== 0) {
			return sev;
		}
		return a.message.localeCompare(b.message);
	});

	return {
		withinPolicy: sorted.every((v) => v.severity !== 'block'),
		violations: sorted,
	};
};

// ---------------------------------------------------------------------------
// T3: frontmatter extraction
// ---------------------------------------------------------------------------

import { extractYamlBlock, parseFrontmatterBlock } from './frontmatter-parser';
import type { IYamlValue } from './frontmatter-parser';

/**
 * A track is valid when it is a non-empty string. If the caller supplies
 * a `knownTracks` set, the track must also be a member (typo-guard for
 * hosts that enumerate their tracks); without it, mcp-vertex stays agnostic
 * and accepts any host track. [M4]
 */
const makeIsValidTrack =
	(knownTracks?: ReadonlySet<string>) =>
	(v: unknown): v is IProposalTrack =>
		typeof v === 'string' &&
		v.length > 0 &&
		(knownTracks === undefined || knownTracks.has(v));

const parseInlineBracketList = (v: IYamlValue): string[] | null => {
	if (typeof v !== 'string') return null;
	const trimmed = v.trim();
	if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return null;
	const inner = trimmed.slice(1, -1);
	if (inner.trim() === '') return [];
	return inner
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
};

/**
 * Convert a YAML value into a string[]. Supports three shapes:
 *   1. a real array (block-array syntax) — items filtered to strings;
 *   2. an inline-flow literal `[a, b, c]` — parsed by
 *      `parseInlineBracketList`;
 *   3. anything else (scalar, object, undefined) — returns [].
 *
 * Inline-bracket support exists because the project convention is
 * to write `parallelismLanes: [meta, audit]` in proposal frontmatter,
 * but the shared `parseFrontmatterBlock` only recognises `[]` inline
 * and falls back to block-array syntax for non-empty sequences.
 */
const asStringArray = (v: IYamlValue | undefined): string[] => {
	if (Array.isArray(v)) {
		return v.filter((x): x is string => typeof x === 'string');
	}
	if (v === undefined) {
		return [];
	}
	const inline = parseInlineBracketList(v);
	if (inline !== null) {
		return inline;
	}
	return [];
};

/**
 * Parse the YAML frontmatter of a proposal markdown file and return its
 * `IProposalParallelism` record, or `null` if the frontmatter does not
 * carry the required `mainWriteLane` key.
 *
 * Behaviour:
 *   - Missing or malformed frontmatter → `null` (the audit pipeline
 *     skips the proposal; the next call evaluates the rest).
 *   - `mainWriteLane` present but invalid (empty, or — when `knownTracks`
 *     is supplied — not a member) → `null` (a typo must NOT silently
 *     degrade to a default lane; the safer default is "no record, no
 *     claim").
 *   - `parallelismLanes` missing → treated as `[]` (strict: the
 *     proposal does not permit ANY parallel track).
 *   - `parallelismLanes` containing invalid tracks → those entries are
 *     silently dropped from the permission set.
 *   - `knownTracks` omitted → mcp-vertex is track-agnostic: any non-empty
 *     string is a valid track (the host owns the vocabulary). [M4]
 *
 * This function is the single seam between the proposal's textual
 * representation and the runtime `evaluateParallelism` evaluator. It
 * exists so the audit-proposals tool does not need to import the
 * heavier `parseProposalDocument` (which validates the full
 * `IProposalFrontmatter` schema) just to read two keys.
 */
export const extractParallelismFromFrontmatter = (
	raw: string,
	proposalId: string,
	knownTracks?: ReadonlySet<string>
): IProposalParallelism | null => {
	const block = extractYamlBlock(raw);
	if (block === null) {
		return null;
	}
	const isValidTrack = makeIsValidTrack(knownTracks);
	const fm = parseFrontmatterBlock(block);
	const lane = fm.mainWriteLane;
	if (!isValidTrack(lane)) {
		return null;
	}
	const permitted = asStringArray(fm.parallelismLanes).filter(
		isValidTrack
	);
	return {
		proposalId,
		mainWriteLane: lane,
		parallelismLanes: permitted,
	};
};
