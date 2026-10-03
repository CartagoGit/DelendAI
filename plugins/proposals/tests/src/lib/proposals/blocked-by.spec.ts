import { describe, expect, it } from 'vitest';

import {
	blockedByFor,
	type IBlockedByReaders,
} from '@delendai/proposals/lib/proposals/blocked-by';
import type { IProposalIndexEntry } from '@delendai/proposals/lib/proposals/index-reader';

/**
 * blocked-by.spec.ts — pins the contract of
 * `plugins/proposals/src/lib/proposals/blocked-by.ts`.
 *
 * The module answers one question: "given an index entry for a
 * `type: plan` proposal, what are the ids of contained children that
 * are not yet `done`?". The spec covers:
 *
 *   - the four early-return paths (non-plan / missing file /
 *     unparseable frontmatter / no `contains:` block),
 *   - a flat `contains:` list, which is not the shape it reads, and
 *     the nested `{ contains: { proposals, plans } }` mapping it does
 *     read (parsed as YAML since r00643; the hand parser read it as
 *     `null`),
 *   - the defaults path (Partial<IBlockedByReaders> defaults to the
 *     module-level readers).
 *
 * SOLID:
 *   - DIP — `blockedByFor` accepts the readers as an injected
 *          `Partial<IBlockedByReaders>`, so the spec exercises the
 *          projection logic without touching the filesystem.
 *   - SRP — each `describe` block covers exactly one concern.
 *   - OCP — the nested-mapping case needed no production change once
 *          the frontmatter parser read YAML (r00643).
 */

const ENTRY: IProposalIndexEntry = {
	id: 'q00001',
	file: 'q00001-plan-of-plans.md',
	status: 'in-progress',
};

const INDEX_PATH_ABS = '/fake/docs/delendai/proposals/index.json';

/** Build a markdown string with a YAML frontmatter block. */
const wrap = (frontmatter: string, body = ''): string =>
	`---\n${frontmatter}\n---\n\n${body}`;

/** Stubs that satisfy `IBlockedByReaders`. Both default to "missing",
 *  so individual tests override only the fields they need. */
const readers = (
	overrides: Partial<IBlockedByReaders> = {},
): Partial<IBlockedByReaders> => ({
	readTextOrNull: async () => null,
	readProposalIndex: async () => [],
	...overrides,
});

describe('blockedByFor — early-return paths', async () => {
	it('returns [] when the proposal file is missing on disk', async () => {
		const result = await blockedByFor(
			ENTRY,
			INDEX_PATH_ABS,
			readers({
				readTextOrNull: async () => null,
			}),
		);
		expect(result).toEqual([]);
	});

	it('returns [] when the proposal file has no frontmatter block', async () => {
		const result = await blockedByFor(
			ENTRY,
			INDEX_PATH_ABS,
			readers({
				readTextOrNull: async () => '# body only, no frontmatter\n',
			}),
		);
		expect(result).toEqual([]);
	});

	it('returns [] when the frontmatter is a plan but the file is unparseable YAML', async () => {
		const result = await blockedByFor(
			ENTRY,
			INDEX_PATH_ABS,
			readers({
				readTextOrNull: async () =>
					'---\n: broken yaml: ::\n---\n\nbody\n',
			}),
		);
		expect(result).toEqual([]);
	});

	it('returns [] when the proposal type is not `plan`', async () => {
		const result = await blockedByFor(
			ENTRY,
			INDEX_PATH_ABS,
			readers({
				readTextOrNull: async () =>
					wrap('id: q00001\nstatus: in-progress\ntype: feat\n'),
			}),
		);
		expect(result).toEqual([]);
	});

	it('returns [] when the plan frontmatter has no `contains:` block', async () => {
		const result = await blockedByFor(
			ENTRY,
			INDEX_PATH_ABS,
			readers({
				readTextOrNull: async () =>
					wrap('id: q00001\nstatus: in-progress\ntype: plan\n'),
			}),
		);
		expect(result).toEqual([]);
	});
});

describe('blockedByFor — happy path (flat-array frontmatter)', async () => {
	// `blockedByFor` reads the nested `contains.proposals` / `.plans`
	// mapping; a flat `contains: [a, b, c]` list is not that shape and
	// declares no children it can read.

	it('returns [] for a flat `contains:` list, which is not the shape it reads', async () => {
		const PLAN = wrap(
			'id: q00001\nstatus: in-progress\ntype: plan\ncontains: [f00049, f00050, q00002]\n',
		);
		const result = await blockedByFor(ENTRY, INDEX_PATH_ABS, {
			readTextOrNull: async () => PLAN,
			readProposalIndex: async () => [
				{ id: 'f00049', file: 'f00049-...md', status: 'in-progress' },
				{ id: 'f00050', file: 'f00050-...md', status: 'in-progress' },
				{ id: 'q00002', file: 'q00002-...md', status: 'in-progress' },
			],
		});
		expect(result).toEqual([]);
	});
});

describe('blockedByFor — defaults (DIP sanity)', async () => {
	it('uses the module-level readers when none are injected', async () => {
		// The production call site in `continue-proposal.tool.ts`
		// leaves both readers undefined. We assert the call does not
		// throw and returns [] for a missing file (the default reader
		// returns null for absent paths).
		const result = await blockedByFor(
			{
				id: 'missing-on-disk',
				file: 'missing.md',
				status: 'in-progress',
			},
			'/this/path/does/not/exist/index.json',
		);
		expect(result).toEqual([]);
	});
});

/**
 * Recorded as a known gap on 2026-06-23: the hand-written frontmatter
 * parser read `contains:\n  proposals:\n    - a` as
 * `{ proposals: null, plans: null }`, so this projection always returned
 * [] and the gap note suggested the `yaml` package. r00643 made that the
 * one parser.
 */
describe('a nested `contains` mapping (read since r00643 as YAML)', async () => {
	it('reports the children the plan still waits on', async () => {
		const PLAN = wrap(
			'id: q00001\ntype: plan\ncontains:\n  proposals:\n    - f00049\n    - f00050\n  plans:\n    - q00002\n',
		);
		const result = await blockedByFor(ENTRY, INDEX_PATH_ABS, {
			readTextOrNull: async () => PLAN,
			readProposalIndex: async () => [
				{ id: 'f00049', file: 'f00049-...md', status: 'in-progress' },
			],
		});
		// The hand-written parser read this block as
		// `contains: { proposals: null, plans: null }`, so a plan never saw
		// its children; YAML reads the lists the block declares.
		expect(result).toContain('f00049');
	});
});
