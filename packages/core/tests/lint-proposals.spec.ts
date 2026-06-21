import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Root-level script, tested alongside the monorepo per the
// derive-version.spec.ts / release-plan.spec.ts convention.
import { lintProposalsDir } from '../../../scripts/lint-proposals';

const write = async (
	root: string,
	relPath: string,
	content: string,
): Promise<void> => {
	const abs = join(root, relPath);
	await mkdir(join(abs, '..'), { recursive: true });
	await writeFile(abs, content, 'utf8');
};

const VALID_PROPOSAL = `---
id: f00014
kind: feat
title: A sufficiently long title
status: ready
date: 2026-06-20
track: proposals
---

## Goal

p.

## Why

p.

## Non-goals

- x

## Slices

### S1 — Do the thing
- **Status**: pending
- **Files**: [\`a.ts\`]
- **Command**: \`bun run test\`
- **Expect**: exit0

## Acceptance

- [ ] done.
`;

describe('lintProposalsDir', () => {
	let root = '';

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'lint-proposals-'));
	});

	afterEach(async () => rm(root, { recursive: true, force: true }));

	it('ignores non-proposal documents (audits, README, n00001 notes)', async () => {
		await write(
			root,
			'audits/16-06-2026- Auditoria.md',
			'# not a proposal\n',
		);
		await write(root, 'n00001-SESION-2026-06-17.md', '# session notes\n');
		await write(root, 'README.md', '# index\n');
		const summary = await lintProposalsDir(root);
		expect(summary.filesChecked).toBe(0);
		expect(summary.ok).toBe(true);
	});

	// Synthetic fixture, not a reference to a real proposal — uses `p99`
	// deliberately (NOT `l99`) to cover the pre-migration prefix; the
	// post-migration `l`-prefix case is covered separately below.
	it('discovers a 2-digit legacy id (p99) and warns instead of skipping it', async () => {
		await write(root, 'p99-old-thing.md', '# no frontmatter at all\n');
		const summary = await lintProposalsDir(root);
		expect(summary.filesChecked).toBe(1);
		expect(summary.legacyWarnings).toBe(1);
		expect(summary.fatalErrors).toBe(0);
		expect(summary.ok).toBe(true);
	});

	it('treats a non-legacy (new kind-prefix) violation as a fatal error', async () => {
		await write(root, 'ready/f200-broken.md', '# no frontmatter at all\n');
		const summary = await lintProposalsDir(root);
		expect(summary.fatalErrors).toBe(1);
		expect(summary.ok).toBe(false);
	});

	// S11/S12: post-migration legacy (`kind: legacy`, prefix `l`) keeps the
	// same permanently-lenient tier as pre-migration `p` — never fatal.
	it('treats a post-migration legacy file (l-prefix) as a warning, not a fatal error', async () => {
		await write(root, 'done/l99-old-thing.md', '# no frontmatter at all\n');
		const summary = await lintProposalsDir(root);
		expect(summary.filesChecked).toBe(1);
		expect(summary.legacyWarnings).toBe(1);
		expect(summary.fatalErrors).toBe(0);
		expect(summary.ok).toBe(true);
	});

	it('passes a fully valid new-scaffold proposal with zero issues', async () => {
		await write(root, 'ready/f00014-do-the-thing.md', VALID_PROPOSAL);
		const summary = await lintProposalsDir(root);
		expect(summary.filesChecked).toBe(1);
		expect(summary.legacyWarnings).toBe(0);
		expect(summary.fatalErrors).toBe(0);
		expect(summary.ok).toBe(true);
	});
});
