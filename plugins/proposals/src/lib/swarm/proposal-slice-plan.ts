// parallel slices per proposal (M3-first). The PLAN lives in
// the proposal document itself (a `## Slices` section); this module
// owns the pure mechanics: parsing, disjointness validation,
// dependsOn ordering and claimability. Runtime "in-progress" state is
// DERIVED from the agent lock (task_id === sliceId), and "done" from
// an explicit `- status: done` line in the doc — no sidecar files, no
// index.json changes (non-goal).

export type ISliceGate = 'lint' | 'type' | 'e2e' | 'none';

export type ISliceStatus = 'pending' | 'in-progress' | 'done' | 'blocked';

export interface IProposalSliceContract {
	readonly proposalId: string;
	readonly sliceId: string;
	readonly title: string;
	/** null = free; otherwise the agent name that claimed the lock. */
	readonly owner: string | null;
	readonly files: readonly string[];
	readonly dependsOn: readonly string[];
	readonly gate: ISliceGate;
	readonly status: ISliceStatus;
	readonly acceptanceCriteria: readonly string[];
}

export interface IProposalSlicePlan {
	readonly proposalId: string;
	readonly slices: readonly IProposalSliceContract[];
	readonly globalGate: ISliceGate;
}

export interface ISliceOverlap {
	readonly first: string;
	readonly second: string;
	readonly file: string;
}

export interface IClaimValidation {
	readonly ok: boolean;
	readonly reason: string;
	readonly blockerType:
		| 'none'
		| 'unknown-slice'
		| 'deps-not-done'
		| 'overlap-in-progress'
		| 'already-done'
		| 'already-in-progress';
}

const GATES: readonly ISliceGate[] = ['lint', 'type', 'e2e', 'none'];

const asGate = (value: string | undefined): ISliceGate =>
	GATES.includes((value ?? '') as ISliceGate)
		? ((value ?? 'none') as ISliceGate)
		: 'none';

/**
 * Parse the `## Slices` section of a proposal markdown. Returns null
 * when the section is absent — the proposal is then a legacy
 * single-slice document and the `plan`/`claim` modes do not apply.
 *
 * Recognised per-slice lines (inside `### <sliceId> — <title>`):
 *   - `- files: <path>` (repeatable)
 *   - `- depends_on: [a, b]`
 *   - `- gate: lint|type|e2e|none`
 *   - `- status: done` or `- **Status**: done` (set by the executor when the slice closes)
 *   - `- acceptance:` followed by indented `- "command"` lines
 */
export const parseProposalSlicePlan = (
	proposalId: string,
	markdown: string,
): IProposalSlicePlan | null => {
	const sectionMatch = markdown.match(
		/^## Slices\s*$([\s\S]*?)(?=^## (?!#)|\n*$(?![\s\S]))/m,
	);
	if (sectionMatch === null) return null;
	const section = sectionMatch[1] ?? '';

	const globalGateMatch = section.match(/^- global_gate:\s*([a-z0-9]+)/m);
	const globalGate = asGate(globalGateMatch?.[1]);

	const slices: IProposalSliceContract[] = [];
	const sliceBlocks = [
		...section.matchAll(
			/^### (\S+)\s+—\s+(.+)$([\s\S]*?)(?=^### |\n*$(?![\s\S]))/gm,
		),
	];
	for (const block of sliceBlocks) {
		const sliceId = block[1] ?? '';
		const title = (block[2] ?? '').trim();
		const body = block[3] ?? '';
		const files = [...body.matchAll(/^[-*]\s*files:\s*(\S+)/gm)]
			.map((m) => m[1] ?? '')
			.filter((f) => f.length > 0);
		const dependsRaw =
			body.match(/^[-*]\s*depends_on:\s*\[([^\]]*)\]/m)?.[1] ?? '';
		const dependsOn = dependsRaw
			.split(',')
			.map((d) => d.trim())
			.filter((d) => d.length > 0);
		const gate = asGate(body.match(/^[-*]\s*gate:\s*(\S+)/m)?.[1]);
		const docDone =
			/^[-*]\s*status:\s*done\b/m.test(body) ||
			/^[-*]\s*\*\*Status\*\*:\s*`?done`?\b/m.test(body);
		const acceptanceBlock =
			body.match(/^[-*]\s*acceptance:\s*\n((?:[ \t]+.*\n?)*)/m)?.[1] ??
			'';
		const acceptanceCriteria = [
			...acceptanceBlock.matchAll(/^\s+[-*]\s*"([^"]+)"/gm),
		]
			.map((m) => m[1] ?? '')
			.filter((c) => c.length > 0);
		slices.push({
			proposalId,
			sliceId,
			title,
			owner: null,
			files,
			dependsOn,
			gate,
			status: docDone ? 'done' : 'pending',
			acceptanceCriteria,
		});
	}
	if (slices.length === 0) return null;
	return { proposalId, slices, globalGate };
};

/** Pairs of slices whose `files` overlap (forbidden by construction). */
export const planDisjointnessIssues = (
	plan: IProposalSlicePlan,
): readonly ISliceOverlap[] => {
	const issues: ISliceOverlap[] = [];
	for (let i = 0; i < plan.slices.length; i += 1) {
		for (let j = i + 1; j < plan.slices.length; j += 1) {
			const a = plan.slices[i];
			const b = plan.slices[j];
			if (a === undefined || b === undefined) continue;
			const bFiles = new Set(b.files);
			for (const file of a.files) {
				if (bFiles.has(file)) {
					issues.push({
						first: a.sliceId,
						second: b.sliceId,
						file,
					});
				}
			}
		}
	}
	return issues;
};

export interface ILockSnapshotEntry {
	readonly taskId: string;
	readonly agent: string;
}

const lockCoversSlice = (
	taskId: string,
	proposalId: string,
	sliceId: string,
): boolean => {
	if (taskId === sliceId || taskId === `${proposalId}-${sliceId}`) {
		return true;
	}
	if (!taskId.startsWith(`${proposalId}-`)) {
		return false;
	}
	const grouped = taskId.slice(proposalId.length + 1).split('-');
	return grouped.includes(sliceId);
};

/**
 * Derive runtime statuses: a doc-level `done` wins; an active lock
 * whose task_id equals the sliceId means `in-progress` (owner = the
 * lock agent); otherwise the parsed status stands.
 */
export const deriveSliceStatuses = (
	plan: IProposalSlicePlan,
	activeLocks: readonly ILockSnapshotEntry[],
): IProposalSlicePlan => {
	return {
		...plan,
		slices: plan.slices.map((slice) => {
			if (slice.status === 'done') return slice;
			const lock = activeLocks.find((candidate) =>
				lockCoversSlice(
					candidate.taskId,
					plan.proposalId,
					slice.sliceId,
				),
			);
			if (lock !== undefined) {
				return { ...slice, status: 'in-progress', owner: lock.agent };
			}
			return slice;
		}),
	};
};

/**
 * Claim validation (read-only): the slice must exist, not be done or
 * already in progress, every dependsOn must be done, and its files
 * must not overlap any in-progress slice of the same plan.
 */
export const validateClaim = (
	plan: IProposalSlicePlan,
	sliceId: string,
): IClaimValidation => {
	const slice = plan.slices.find(
		(candidate) => candidate.sliceId === sliceId,
	);
	if (slice === undefined) {
		return {
			ok: false,
			blockerType: 'unknown-slice',
			reason: `slice "${sliceId}" is not declared in the ## Slices section of ${plan.proposalId}`,
		};
	}
	if (slice.status === 'done') {
		return {
			ok: false,
			blockerType: 'already-done',
			reason: `slice "${sliceId}" is already done`,
		};
	}
	if (slice.status === 'in-progress') {
		return {
			ok: false,
			blockerType: 'already-in-progress',
			reason: `slice "${sliceId}" is already in progress (owner: ${slice.owner ?? 'unknown'})`,
		};
	}
	const byId = new Map(plan.slices.map((s) => [s.sliceId, s]));
	const missingDeps = slice.dependsOn.filter(
		(dep) => byId.get(dep)?.status !== 'done',
	);
	if (missingDeps.length > 0) {
		return {
			ok: false,
			blockerType: 'deps-not-done',
			reason: `slice "${sliceId}" depends on [${missingDeps.join(', ')}] which are not done`,
		};
	}
	const mine = new Set(slice.files);
	for (const other of plan.slices) {
		if (other.sliceId === sliceId || other.status !== 'in-progress') {
			continue;
		}
		const overlap = other.files.find((file) => mine.has(file));
		if (overlap !== undefined) {
			return {
				ok: false,
				blockerType: 'overlap-in-progress',
				reason: `slice "${sliceId}" overlaps in-progress slice "${other.sliceId}" on ${overlap}`,
			};
		}
	}
	return { ok: true, blockerType: 'none', reason: 'claimable' };
};
