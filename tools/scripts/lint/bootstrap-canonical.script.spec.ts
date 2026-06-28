/**
 * bootstrap-canonical.script.spec.ts — f00083 S2 acceptance.
 *
 * Pin the contract:
 *   - clean bootstrap (the real one on disk) passes
 *   - a bootstrap missing a canonical section fails
 *   - a bootstrap with sections in the wrong order fails
 *   - a bootstrap with a duplicate H2 fails
 *   - a bootstrap missing the anchor string fails
 *   - a missing bootstrap file fails with a "restore" next-action
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	ANCHOR,
	BOOTSTRAP_PATH,
	CANONICAL_SECTIONS,
	lintBootstrap,
	lintBootstrapForWorkspace,
	lintBootstrapFromDisk,
} from './bootstrap-canonical.script.ts';

let workspaceRoot = '';

// Resolve the monorepo root by walking up from this spec file.
// Bun's `import.meta.dir` is not portable; use the URL + dirname pair.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

beforeEach(() => {
	workspaceRoot = mkdtempSync(join(tmpdir(), 'bootstrap-canonical-'));
});

afterEach(() => {
	rmSync(workspaceRoot, { recursive: true, force: true });
});

/** A fixture that mimics the canonical shape. */
const cleanBootstrap = (): string => [
	'# Universal agent bootstrap',
	'',
	`> ${ANCHOR}.`,
	'',
	'---',
	'',
	...CANONICAL_SECTIONS.map((s) => `${s}\n\nBody for ${s}.`),
	'',
	'## 8.1 Copilot appendix (allowed sub-heading inside §8)',
	'',
	'Body of the appendix.',
	'',
].join('\n');

describe('bootstrap-canonical lint', () => {
	it('exports the canonical anchor and the canonical section list', () => {
		expect(ANCHOR).toBe('This file is the only place agent rules live');
		expect(BOOTSTRAP_PATH).toBe('docs/mcp-vertex/AGENT-BOOTSTRAP.md');
		expect(CANONICAL_SECTIONS.length).toBe(9);
		expect(CANONICAL_SECTIONS[0]).toBe('## Table of contents');
		expect(CANONICAL_SECTIONS.at(-1)).toBe('## 8. Host appendices');
	});

	it('clean bootstrap (in-memory fixture) passes', () => {
		const out = lintBootstrap(cleanBootstrap());
		expect(out.violations).toEqual([]);
	});

	it('missing a canonical section fails with kind=missing-section', () => {
		// Drop the last canonical section heading. We drop the LAST
		// one so the lint reports `missing-section` rather than
		// `out-of-order` for whatever section happens to follow.
		const body = cleanBootstrap().replace(/## 8\. Host appendices\n/, '');
		const out = lintBootstrap(body);
		const missing = out.violations.filter((v) => v.kind === 'missing-section');
		expect(missing).toHaveLength(1);
		expect(missing[0]?.message).toContain('## 8. Host appendices');
		expect(missing[0]?.nextAction).toContain('Restore the missing H2');
	});

	it('sections in wrong order fails with kind=out-of-order', () => {
		// Swap §1 and §2 by replacing their heading lines in place.
		const body = cleanBootstrap()
			.replace('## 1. Orient first — one cheap call', '__SECTION_1__')
			.replace('## 2. Route work — ask the server', '## 1. Orient first — one cheap call')
			.replace('__SECTION_1__', '## 2. Route work — ask the server');
		const out = lintBootstrap(body);
		const ooo = out.violations.filter((v) => v.kind === 'out-of-order');
		expect(ooo.length).toBeGreaterThan(0);
		expect(ooo[0]?.nextAction).toContain('Do not edit the section order');
	});

	it('duplicate H2 fails with kind=duplicate-section and the right line numbers', () => {
		// Duplicate `## Table of contents` after §8.
		const body = `${cleanBootstrap()}\n## Table of contents\n\nstray\n`;
		const out = lintBootstrap(body);
		const dups = out.violations.filter((v) => v.kind === 'duplicate-section');
		expect(dups).toHaveLength(1);
		expect(dups[0]?.line).toBeGreaterThan(0);
		expect(dups[0]?.message).toContain('Table of contents');
	});

	it('missing anchor string fails with kind=missing-anchor', () => {
		const body = cleanBootstrap().replace(ANCHOR, 'a different sentence');
		const out = lintBootstrap(body);
		const anchors = out.violations.filter((v) => v.kind === 'missing-anchor');
		expect(anchors).toHaveLength(1);
		expect(anchors[0]?.nextAction).toContain('Restore the anchor sentence');
	});

	it('extra sub-headings inside §8 (e.g. 8.1, 8.2) do not break the order check', () => {
		// Simulate a host appendix inside §8. This should NOT trigger
		// out-of-order, because the appendix is "## 8.1 ..." which is
		// not in CANONICAL_SECTIONS.
		const body = cleanBootstrap();
		const out = lintBootstrap(body);
		const ooo = out.violations.filter((v) => v.kind === 'out-of-order');
		expect(ooo).toEqual([]);
	});

	it('lintBootstrapFromDisk reads the real bootstrap and returns zero violations', () => {
		const realPath = resolve(REPO_ROOT, BOOTSTRAP_PATH);
		const out = lintBootstrapFromDisk(realPath);
		expect(out.violations).toEqual([]);
		expect(out.headingCount).toBeGreaterThanOrEqual(CANONICAL_SECTIONS.length);
	});

	it('lintBootstrapForWorkspace returns one missing-anchor violation when the file does not exist', () => {
		const out = lintBootstrapForWorkspace(workspaceRoot);
		expect(out).toHaveLength(1);
		expect(out[0]?.violations[0]?.kind).toBe('missing-anchor');
		expect(out[0]?.violations[0]?.nextAction).toContain('Restore');
	});

	it('lintBootstrapForWorkspace with a fixture bootstrap returns zero violations', () => {
		mkdirSync(resolve(workspaceRoot, 'docs/mcp-vertex'), { recursive: true });
		writeFileSync(resolve(workspaceRoot, BOOTSTRAP_PATH), cleanBootstrap());
		const out = lintBootstrapForWorkspace(workspaceRoot);
		expect(out).toHaveLength(1);
		expect(out[0]?.violations).toEqual([]);
	});
});
