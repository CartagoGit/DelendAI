import type { IReconcilerInputFile } from '../../src';

/**
 * large-proposal-set.ts — x00528 S3.
 *
 * The rebuild-digest gate is only as strong as what it feeds the
 * reconciler. The original fixture (a00094) emitted 60 byte-identical
 * `kind: fix` / `status: ready` proposals with no plans, no slices, no
 * closed entities and no corrupt input, so the gate certified a much
 * narrower property than its name promised.
 *
 * This fixture is deliberately heterogeneous and fully deterministic
 * (no clock, no randomness):
 *
 *   - 55 flat proposals cycling every `kind` and `status` the 0001
 *     CHECK constraints accept, several of them terminal (so
 *     `closed_at` is exercised);
 *   - 6 `kind: plan` proposals carrying a `## Slices` section, which
 *     project one `plans` row plus 2-4 `slices` rows each, including
 *     `done` slices that must land with a non-null `closed_at` under
 *     the 0008 parity triggers;
 *   - 1 proposal with a `## Slices` heading but no slice entries, to
 *     pin "no slices declared is not an error";
 *   - 2 corrupt files that must be quarantined rather than crash the
 *     run: one with frontmatter but no `id`, one with no frontmatter
 *     at all.
 */

const KINDS = [
	'feat',
	'breaking',
	'fix',
	'refactor',
	'perf',
	'audit',
	'chore',
	'docs',
	'test',
	'spike',
	'resume',
] as const;

const STATUSES = [
	'draft',
	'ready',
	'in-progress',
	'review',
	'blocked',
	'paused',
	'done',
	'retired',
	'superseded',
	'quarantined',
] as const;

const TRACKS = ['architecture', 'delivery', 'quality', 'docs'] as const;

/** Status vocabulary as it is actually written in `## Slices` blocks. */
const SLICE_STATUSES = [
	'pending',
	'done',
	'in-progress',
	'blocked',
	'done (2026-07-24)',
	'ready',
] as const;

export const FLAT_PROPOSAL_COUNT = 55;
export const PLAN_PROPOSAL_COUNT = 6;
export const EMPTY_SLICES_PROPOSAL_COUNT = 1;
export const CORRUPT_FILE_COUNT = 2;

/** Slices declared per plan fixture: 2, 3, 4, 2, 3, 4 → 18 total. */
const slicesForPlan = (planIndex: number): number => 2 + (planIndex % 3);

export const EXPECTED_SLICE_COUNT = Array.from(
	{ length: PLAN_PROPOSAL_COUNT },
	(_, index) => slicesForPlan(index),
).reduce((total, count) => total + count, 0);

export const EXPECTED_PROPOSAL_COUNT =
	FLAT_PROPOSAL_COUNT + PLAN_PROPOSAL_COUNT + EMPTY_SLICES_PROPOSAL_COUNT;

/** Plans are projected for `kind: plan` files and for anything with slices. */
export const EXPECTED_PLAN_COUNT =
	PLAN_PROPOSAL_COUNT + EMPTY_SLICES_PROPOSAL_COUNT;

export const EXPECTED_FILE_COUNT = EXPECTED_PROPOSAL_COUNT + CORRUPT_FILE_COUNT;

const pad = (value: number): string => String(value).padStart(5, '0');

const flatProposal = (index: number): IReconcilerInputFile => {
	const number = pad(index + 1);
	const kind = KINDS[index % KINDS.length] ?? 'fix';
	const status = STATUSES[index % STATUSES.length] ?? 'ready';
	const track = TRACKS[index % TRACKS.length] ?? 'architecture';
	return {
		path: `ready/fixes/x${number}-fixture.md`,
		sha: `blob-x${number}`,
		raw: `---
id: x${number}
title: Fixture proposal ${number}
kind: ${kind}
status: ${status}
type: proposal
track: ${track}
---
# Fixture proposal ${number}

Deterministic rebuild fixture entry ${number}.
`,
	};
};

const sliceBlock = (planIndex: number, sliceIndex: number): string => {
	const sliceId = `S${String(sliceIndex + 1)}`;
	const status =
		SLICE_STATUSES[(planIndex + sliceIndex) % SLICE_STATUSES.length] ??
		'pending';
	return `### ${sliceId} — Fixture slice ${sliceId} of plan ${String(planIndex + 1)}
- **Status**: ${status}
- **Files**: \`packages/fixture/src/lib/${sliceId.toLowerCase()}.ts\`
- **Gate**: type
- acceptance:
  - "Fixture acceptance for ${sliceId}."
`;
};

const planProposal = (planIndex: number): IReconcilerInputFile => {
	const number = pad(planIndex + 1);
	// Stride 2 so the six plans cover draft / in-progress / blocked /
	// done / superseded — i.e. at least two terminal plans, which the
	// 0008 parity triggers require to carry a non-null `closed_at`.
	const status = STATUSES[(planIndex * 2) % STATUSES.length] ?? 'ready';
	const slices = Array.from(
		{ length: slicesForPlan(planIndex) },
		(_, sliceIndex) => sliceBlock(planIndex, sliceIndex),
	).join('\n');
	return {
		path: `ready/plans/q${number}-fixture-plan.md`,
		sha: `blob-q${number}`,
		raw: `---
id: q${number}
title: Fixture plan ${number}
kind: plan
status: ${status}
type: proposal
track: architecture
---
# Fixture plan ${number}

## Goal

Deterministic rebuild fixture plan ${number}.

## Slices

- global_gate: type

${slices}
## acceptance

- Fixture plan ${number} projects its slices.
`,
	};
};

/** A plan-shaped file whose `## Slices` section declares nothing. */
const emptySlicesProposal = (): IReconcilerInputFile => ({
	path: 'ready/plans/q09999-fixture-plan-without-slices.md',
	sha: 'blob-q09999',
	raw: `---
id: q09999
title: Fixture plan without slices
kind: plan
status: ready
type: proposal
track: architecture
---
# Fixture plan without slices

## Slices

- global_gate: type

## acceptance

- Declaring no slices is not an error.
`,
});

const corruptFiles = (): readonly IReconcilerInputFile[] => [
	{
		// Frontmatter parses, but there is no stable identity.
		path: 'ready/fixes/x99998-fixture-corrupt-no-id.md',
		sha: 'blob-x99998',
		raw: `---
title: Corrupt fixture without id
kind: fix
status: ready
type: proposal
track: architecture
---
# Corrupt fixture without id
`,
	},
	{
		// No YAML block at all: the parser throws and the run quarantines.
		path: 'ready/fixes/x99999-fixture-corrupt-no-frontmatter.md',
		sha: 'blob-x99999',
		raw: `# Corrupt fixture without frontmatter

There is no YAML block here, so this file cannot be projected.
`,
	},
];

export const largeProposalSet = (): readonly IReconcilerInputFile[] => [
	...Array.from({ length: FLAT_PROPOSAL_COUNT }, (_, index) =>
		flatProposal(index),
	),
	...Array.from({ length: PLAN_PROPOSAL_COUNT }, (_, index) =>
		planProposal(index),
	),
	emptySlicesProposal(),
	...corruptFiles(),
];
