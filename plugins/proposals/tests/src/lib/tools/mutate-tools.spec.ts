/**
 * `proposals_edit` + `proposals_add_slice` (S10, f00020). Each tool's
 * pure handler is exercised directly via the `capture()` harness (same
 * pattern as `authoring.spec.ts`) against a temporary proposals
 * dir/index — never the real `docs/mcp-vertex/proposals/` tree. The golden test at
 * the bottom re-parses the mutated `.md` with the real
 * `parseProposalDocument` loader against a COPY of
 * `docs/mcp-vertex/proposals/done/feats/f00023-plugins-depth-extension.md` (read as
 * a reference fixture only; the original is never modified).
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import {
	buildProposalsAddSliceRegistration,
	buildProposalsEditRegistration,
	type IMutateToolOptions,
} from '@mcp-vertex/proposals/lib/tools/mutate-tools';
import { syncProposalRegistry } from '@mcp-vertex/proposals/lib/proposals/sync-proposal-registry';
import { parseProposalDocument } from '@mcp-vertex/proposals/lib/proposals/proposal-document';

const capture = async (
	reg: IToolRegistration,
): Promise<
	(a: unknown) => Promise<{
		content: Array<{ text: string }>;
		isError?: boolean;
		structuredContent?: Record<string, unknown>;
	}>
> => {
	let h!: (a: unknown) => Promise<{
		content: Array<{ text: string }>;
		isError?: boolean;
		structuredContent?: Record<string, unknown>;
	}>;
	await reg.register({
		registerTool: (_n: string, _d: unknown, fn: typeof h) => {
			h = fn;
		},
	} as never);
	return h;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parse = (r: { content: Array<{ text: string }> }): any =>
	JSON.parse(r.content[0]?.text ?? '{}');

/**
 * `syncProposalRegistry` reconciles each file's folder against its
 * frontmatter `status` and MOVES it when the two disagree, so the doc's
 * final on-disk path is only knowable by reading the index it just
 * wrote — never assume the folder the fixture was first written into.
 */
const resolveDocPath = async (
	indexPathAbs: string,
	id: string,
	proposalsDirAbs?: string,
): Promise<string> => {
	const index = JSON.parse(await readFile(indexPathAbs, 'utf8')) as {
		proposals: Array<{ id: string; file: string }>;
	};
	const entry = index.proposals.find((p) => p.id === id);
	if (entry === undefined) {
		throw new Error(`fixture setup error: "${id}" not found in index`);
	}
	// x00052: `entry.file` is `proposalsDir`-relative (was implicitly
	// `dirname(indexPathAbs)`-relative). Use `proposalsDirAbs` when
	// present, fall back to the legacy behaviour otherwise.
	return join(proposalsDirAbs ?? dirname(indexPathAbs), entry.file);
};

const FIXTURE = `---
id: f900
status: ready
type: proposal
track: plugins
date: 2026-06-21
kind: feat
title: Mutate-tools test fixture
---

# f900 — Mutate-tools test fixture

## Goal

Original goal text.

## Why

Original why text.

## Non-goals

- Original non-goal one.

## Slices

### S1 — first slice
- files: plugins/a/src/x.ts
- gate: none
- status: pending

### S2 — second slice
- files: plugins/b/src/y.ts
- gate: none
- status: pending

## Acceptance

- [ ] Original acceptance line.

## risks and mitigations

- Original risk.
`;

describe('proposals_edit / proposals_add_slice (S10)', async () => {
	let root = '';
	let opts: IMutateToolOptions;
	let docPath: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'mutate-tools-'));
		const proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		await mkdir(proposalsDirAbs, { recursive: true });
		await writeFile(
			join(proposalsDirAbs, 'f900-mutate-tools-test-fixture.md'),
			FIXTURE,
			'utf8',
		);
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			// x00052: the registry index now lives under
			// `<cacheDir>/proposals/index.json`. The proposalsDir is
			// still `docs/mcp-vertex/proposals` — only the index path
			// moved.
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
		};
		// Build the index the same way the rest of the plugin does. This
		// also reconciles the file into the folder matching its
		// frontmatter `status` (here: `ready/`) — resolve the final path
		// from the index rather than assuming the folder.
		await syncProposalRegistry(root);
		docPath = await resolveDocPath(
			opts.indexPathAbs,
			'f900',
			opts.proposalsDirAbs,
		);
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('edits the goal field, preserving ## Slices and everything else', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		const result = parse(
			await edit({ id: 'f900', field: 'goal', value: 'New goal text.' }),
		);
		expect(result.ok).toBe(true);

		const md = await readFile(docPath, 'utf8');
		expect(md).toContain('New goal text.');
		expect(md).not.toContain('Original goal text.');
		// Slices section untouched.
		expect(md).toContain('### S1 — first slice');
		expect(md).toContain('### S2 — second slice');
		expect(md).toContain('files: plugins/a/src/x.ts');
		// Frontmatter untouched.
		expect(md).toContain('id: f900');
		expect(md).toContain('status: ready');
	});

	it('edits the acceptance field with an array value', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		const result = parse(
			await edit({
				id: 'f900',
				field: 'acceptance',
				value: ['New criterion A', 'New criterion B'],
			}),
		);
		expect(result.ok).toBe(true);

		const md = await readFile(docPath, 'utf8');
		expect(md).toContain('- New criterion A');
		expect(md).toContain('- New criterion B');
		expect(md).not.toContain('Original acceptance line.');
		// risks section (after Acceptance) is untouched.
		expect(md).toContain('Original risk.');
	});

	it('adds a disjoint slice and it passes', async () => {
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		const result = parse(
			await addSlice({
				id: 'f900',
				slice: {
					sliceId: 'S3',
					files: ['plugins/c/src/z.ts'],
					acceptanceCriteria: ['bun test'],
				},
			}),
		);
		expect(result.ok).toBe(true);
		expect(result.sliceId).toBe('S3');

		const md = await readFile(docPath, 'utf8');
		expect(md).toContain('### S3 — S3');
		expect(md).toContain('files: plugins/c/src/z.ts');
		expect(md).toContain('- "bun test"');
	});

	it('rejects a new slice whose files overlap an existing slice', async () => {
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		const result = await addSlice({
			id: 'f900',
			slice: {
				sliceId: 'S3',
				files: ['plugins/a/src/x.ts'],
			},
		});
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('overlaps');

		const md = await readFile(docPath, 'utf8');
		expect(md).not.toContain('### S3');
	});

	it('rejects a new slice with an invalid dependsOn', async () => {
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		const result = await addSlice({
			id: 'f900',
			slice: {
				sliceId: 'S3',
				files: ['plugins/c/src/z.ts'],
				dependsOn: ['S99-does-not-exist'],
			},
		});
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('unknown slice');
	});

	it('rejects a new slice with a duplicate sliceId', async () => {
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		const result = await addSlice({
			id: 'f900',
			slice: {
				sliceId: 'S1',
				files: ['plugins/c/src/z.ts'],
			},
		});
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('already exists');
	});

	it('rejects edit with an unknown field', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		const result = await edit({
			id: 'f900',
			field: 'bogusField',
			value: 'x',
		});
		expect(result.isError).toBe(true);
	});

	it('rejects edit for a proposal id that does not exist', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		const result = await edit({
			id: 'f999-does-not-exist',
			field: 'goal',
			value: 'x',
		});
		expect(result.isError).toBe(true);
		expect(parse(result).error.reason).toContain('not found');
	});

	it('keeps the document parseable by the real proposal loader after edit + add_slice', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		await edit({ id: 'f900', field: 'why', value: 'Edited why.' });
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		await addSlice({
			id: 'f900',
			slice: { sliceId: 'S3', files: ['plugins/c/src/z.ts'] },
		});

		const doc = await parseProposalDocument(docPath);
		expect(doc.frontmatter.id).toBe('f900');
		expect(doc.frontmatter.status).toBe('ready');
	});
});

// Resolve from this test file's own location (not process.cwd(), which
// varies with the invoking shell) up to the monorepo root.
const REPO_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../../../../..',
);
const REFERENCE_FIXTURE_PATH = join(
	REPO_ROOT,
	'docs/mcp-vertex/proposals/done/feats/f00023-plugins-depth-extension.md',
);

describe('golden fixture: real-proposal shape stays parseable (reference only, never modified)', async () => {
	let root = '';
	let docPath: string;
	let opts: IMutateToolOptions;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'mutate-tools-golden-'));
		const proposalsDirAbs = join(root, 'docs/mcp-vertex/proposals');
		await mkdir(proposalsDirAbs, { recursive: true });
		const referenceRaw = await readFile(REFERENCE_FIXTURE_PATH, 'utf8');
		// Work on a COPY — the real reference file under docs/mcp-vertex/proposals is
		// never written to by this test.
		await writeFile(
			join(proposalsDirAbs, 'f00023-plugins-depth-extension.md'),
			referenceRaw,
			'utf8',
		);
		opts = {
			namespacePrefix: 'proposals',
			workspaceRoot: root,
			// x00052: see the matching `proposalsDirAbs` in the other
			// describe block — the index moved under cacheDir but
			// `proposalsDirAbs` is unchanged.
			indexPathAbs: join(root, '.cache/mcp-vertex/proposals/index.json'),
			proposalsDirAbs: join(root, 'docs/mcp-vertex/proposals'),
		};
		// Reconciles the copy into the folder matching its frontmatter
		// `status: done` (here: `done/feats/`) — resolve the final path
		// from the index rather than assuming the folder.
		await syncProposalRegistry(root);
		docPath = await resolveDocPath(
			opts.indexPathAbs,
			'f00023',
			opts.proposalsDirAbs,
		);
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('proposals_edit on the real-shaped fixture stays parseable by the loader', async () => {
		const edit = await capture(buildProposalsEditRegistration(opts));
		const result = parse(
			await edit({
				id: 'f00023',
				field: 'risk',
				value: 'Updated risk text for the golden test.',
			}),
		);
		expect(result.ok).toBe(true);

		const doc = await parseProposalDocument(docPath);
		expect(doc.frontmatter.id).toBe('f00023');
		expect(doc.frontmatter.status).toBe('done');

		const md = await readFile(docPath, 'utf8');
		expect(md).toContain('Updated risk text for the golden test.');
		// Slices untouched.
		expect(md).toContain('### S1 — `search`: optional `rg` backend');
	});

	it('proposals_add_slice on the real-shaped fixture stays parseable and disjoint', async () => {
		const addSlice = await capture(
			buildProposalsAddSliceRegistration(opts),
		);
		const result = parse(
			await addSlice({
				id: 'f00023',
				slice: {
					sliceId: 'S5',
					files: ['plugins/golden/src/new.ts'],
					acceptanceCriteria: ['bun test'],
				},
			}),
		);
		expect(result.ok).toBe(true);

		const doc = await parseProposalDocument(docPath);
		expect(doc.frontmatter.id).toBe('f00023');

		const md = await readFile(docPath, 'utf8');
		expect(md).toContain('### S5 — S5');
	});
});
