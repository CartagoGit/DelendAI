/**
 * ref-kinds.constant.ts — every kind of ref the product keeps under its
 * own namespace, stated once.
 *
 * The reconciler acts on refs by kind, and `lint:ref-kinds` fails on a ref
 * under the namespace whose kind is not listed here: a new kind of ref
 * arrives with its place in this list, never as an unowned stray.
 */

import type { IRefKind } from '../interfaces/ref-reconciler.interface';

export const REF_KINDS: readonly IRefKind[] = [
	{ kind: 'work', segment: 'wip' },
	{ kind: 'publication', segment: 'pr' },
	{ kind: 'retired', segment: 'retired' },
	{ kind: 'claim', segment: 'claims' },
	{ kind: 'reservation', segment: 'reservations' },
	{ kind: 'land-batch', segment: 'queue' },
	{ kind: 'train', segment: 'train' },
	{ kind: 'culprit', segment: 'culprit' },
	{ kind: 'rehearsal', segment: 'rehearsal' },
	{ kind: 'unit-worktree', segment: 'worktrees' },
	{ kind: 'proposal-id', segment: 'ids' },
	{ kind: 'rescued', segment: 'rescued' },
	{ kind: 'stranded', segment: 'stranded' },
	{ kind: 'journal', segment: 'journal' },
];

/** An empty unit with a clean worktree is retired after this long, unless the project's policy says otherwise. */
export const DEFAULT_EMPTY_UNIT_GRACE_SECONDS = 1800;
