#!/usr/bin/env bun
/**
 * check-adr-coverage.script.spec.ts — pins the contract of
 * `tools/scripts/lint/check-adr-coverage.script.ts` (d00012).
 *
 * The pure layer (`extractReferencedIds`, `idHasProposalFile`) is
 * tested in isolation; the filesystem walk (`checkAdrCoverage`) is
 * exercised once against a synthetic ADR + proposals tree under a
 * temp dir.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	checkAdrCoverage,
	extractReferencedIds,
	idHasProposalFile,
} from './check-adr-coverage.script.ts';

describe('extractReferencedIds', () => {
	it('extracts every unique proposal-id-shaped token', () => {
		const text = `
- \`r00028\` — subpath exports implementation (predecessor).
- \`d00012\` — proposal that produced this ADR.
- \`q00006\` — parent plan.
`;
		expect(extractReferencedIds(text)).toEqual([
			'd00012',
			'q00006',
			'r00028',
		]);
	});

	it('deduplicates repeated ids', () => {
		const text = '`r00028` and later `r00028` again';
		expect(extractReferencedIds(text)).toEqual(['r00028']);
	});

	it('ignores 3-digit and 6-digit lookalikes', () => {
		const text = 'a123 is too short, a1234567 is too long';
		expect(extractReferencedIds(text)).toEqual([]);
	});

	it('returns an empty array for prose with no ids', () => {
		expect(extractReferencedIds('Just prose, no ids here.')).toEqual([]);
	});
});

describe('idHasProposalFile', () => {
	const basenames = [
		'r00028-subpath-exports.md',
		'd00012-adr-contracts.md',
		'q00006.md',
	];

	it('matches a hyphenated proposal filename', () => {
		expect(idHasProposalFile('r00028', basenames)).toBe(true);
	});

	it('matches an exact-basename proposal file (no trailing slug)', () => {
		expect(idHasProposalFile('q00006', basenames)).toBe(true);
	});

	it('returns false for an id with no matching file', () => {
		expect(idHasProposalFile('r99999', basenames)).toBe(false);
	});

	it('does not false-positive on a shared numeric prefix', () => {
		// r00028 must not match a file for r000280 or r00028x.
		expect(idHasProposalFile('r0002', basenames)).toBe(false);
	});
});

describe('checkAdrCoverage (integration: real filesystem under a temp dir)', () => {
	let root: string;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'check-adr-coverage-'));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const adrDir = (r: string) => join(r, 'docs', 'mcp-vertex', 'adr');
	const proposalsDir = (r: string) =>
		join(r, 'docs', 'mcp-vertex', 'proposals');

	it('reports zero issues when every referenced id has a proposal file', async () => {
		await mkdir(adrDir(root), { recursive: true });
		await mkdir(join(proposalsDir(root), 'done'), { recursive: true });
		await writeFile(
			join(adrDir(root), '0007-example.md'),
			'# ADR 0007\n\nSee `r00028` for context.\n',
		);
		await writeFile(
			join(proposalsDir(root), 'done', 'r00028-subpath.md'),
			'body',
		);

		const { issues, adrCount } = checkAdrCoverage(root);
		expect(adrCount).toBe(1);
		expect(issues).toEqual([]);
	});

	it('flags a reference to an id with no proposal file anywhere', async () => {
		await mkdir(adrDir(root), { recursive: true });
		await mkdir(join(proposalsDir(root), 'done'), { recursive: true });
		await writeFile(
			join(adrDir(root), '0007-example.md'),
			'# ADR 0007\n\nSee `r99999` for context.\n',
		);

		const { issues } = checkAdrCoverage(root);
		expect(issues).toEqual([
			{
				adrFile: 'docs/mcp-vertex/adr/0007-example.md',
				referencedId: 'r99999',
			},
		]);
	});

	it('finds a referenced proposal file in any lifecycle folder, not just done/', async () => {
		await mkdir(adrDir(root), { recursive: true });
		await mkdir(join(proposalsDir(root), 'retired'), { recursive: true });
		await writeFile(
			join(adrDir(root), '0007-example.md'),
			'`r00029` was retired but is still a valid reference.\n',
		);
		await writeFile(
			join(proposalsDir(root), 'retired', 'r00029-old.md'),
			'body',
		);

		const { issues } = checkAdrCoverage(root);
		expect(issues).toEqual([]);
	});

	it('returns adrCount 0 for an empty ADR directory', async () => {
		await mkdir(adrDir(root), { recursive: true });
		await mkdir(proposalsDir(root), { recursive: true });
		const { issues, adrCount } = checkAdrCoverage(root);
		expect(adrCount).toBe(0);
		expect(issues).toEqual([]);
	});
});
