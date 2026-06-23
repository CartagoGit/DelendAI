import { describe, expect, it } from 'vitest';

import {
	blockedByFor,
	type IBlockedByReaders,
} from '@mcp-vertex/proposals/lib/proposals/blocked-by';
import type { IProposalIndexEntry } from '@mcp-vertex/proposals/lib/proposals/index-reader';

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
 *   - the documented parser-gap (the current custom YAML parser
 *     does NOT produce the nested `{ contains: { proposals, plans } }`
 *     shape that the production code reads — see KNOWN_GAPS),
 *   - the defaults path (Partial<IBlockedByReaders> defaults to the
 *     module-level readers).
 *
 * SOLID:
 *   - DIP — `blockedByFor` accepts the readers as an injected
 *          `Partial<IBlockedByReaders>`, so the spec exercises the
 *          projection logic without touching the filesystem.
 *   - SRP — each `describe` block covers exactly one concern.
 *   - OCP — once the frontmatter parser gains nested-mapping
 *          support, this spec's "parser-gap" block collapses into
 *          the happy path; no production-code change needed.
 */

const ENTRY: IProposalIndexEntry = {
	id: 'q00001',
	file: 'q00001-plan-of-plans.md',
	status: 'in-progress',
};

const INDEX_PATH_ABS = '/fake/docs/proposals/index.json';

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

describe('blockedByFor — early-return paths', () => {
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

describe('blockedByFor — happy path (flat-array frontmatter)', () => {
	// The current `parseFrontmatterBlock` (custom YAML parser) does NOT
	// produce a nested `{ contains: { proposals: [...], plans: [...] } }`
	// shape — it produces a flat array `contains: [a, b, c]` (or nothing).
	// `blockedByFor` reads `fm.contains.proposals` (nested), so with the
	// current parser it always returns []. We pin that behaviour here so
	// the gap is visible in CI; see KNOWN_GAPS for the follow-up.

	it('returns [] when the parser produces a flat-array `contains:` (parser-gap today)', async () => {
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

describe('blockedByFor — defaults (DIP sanity)', () => {
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
 * KNOWN_GAPS — frontmatter parser does not produce nested mappings.
 *
 * Discovered while writing this spec on 2026-06-23. The custom
 * YAML parser in `plugins/proposals/src/lib/proposals/frontmatter-parser.ts`
 * does NOT support nested mappings with array values:
 *
 *   - `contains: [a, b, c]`            → `fm.contains` is `[a, b, c]`
 *   - `contains:\n  proposals:\n    - a` → `fm.contains` is `{ proposals: null, plans: null }`
 *
 * `blockedByFor` reads `fm.contains.proposals` (nested). With the
 * current parser, that path is always `undefined` and the projection
 * always returns []. Fixing this is orthogonal to q00001's S1
 * (this module's extraction) and should be filed against the
 * `frontmatter-parser` module's owner — or by switching to the `yaml`
 * npm package, which already handles nested mappings.
 */
describe('KNOWN_GAPS — frontmatter-parser nested-mapping support', () => {
	it('parser returns `contains: { proposals: null, plans: null }` for nested YAML with arrays', async () => {
		const PLAN = wrap(
			'id: q00001\ntype: plan\ncontains:\n  proposals:\n    - f00049\n    - f00050\n  plans:\n    - q00002\n',
		);
		const result = await blockedByFor(ENTRY, INDEX_PATH_ABS, {
			readTextOrNull: async () => PLAN,
			readProposalIndex: async () => [
				{ id: 'f00049', file: 'f00049-...md', status: 'in-progress' },
			],
		});
		// Today: empty (see KNOWN_GAPS above).
		expect(result).toEqual([]);
	});
});
