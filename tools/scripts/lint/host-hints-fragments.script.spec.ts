/**
 * host-hints-fragments.script.spec.ts — f00083 S3 acceptance.
 *
 * Pin the contract:
 *   - clean fragment (markers + bootstrap link + no enumeration) passes
 *   - missing markers fails with a "regenerate" fix
 *   - skill-id enumeration fails (delegated to S1)
 *   - missing fragment file fails with exists=false
 *   - real fragments on disk pass (integration test)
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	HOST_HINT_FRAGMENTS,
	findStrayFragments,
	lintAllHostHintFragments,
	lintHostHintFragment,
	lintStrayFragments,
} from './host-hints-fragments.script.ts';

let workspaceRoot = '';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const writeFragment = (relPath: string, content: string): void => {
	const abs = resolve(workspaceRoot, relPath);
	mkdirSync(dirname(abs), { recursive: true });
	writeFileSync(abs, content);
};

const cleanFragment = (): string =>
	[
		'<!-- Auto-generated discovery fragment. -->',
		'<!-- Regenerate with `bun run catalog:hints`. Do not edit by hand. -->',
		'',
		'<!-- BEGIN GENERATED: f00056 S4 (agnostic bootstrap). -->',
		'',
		'## Discovery',
		'',
		'Follow the universal bootstrap at',
		'[`docs/mcp-vertex/AGENT-BOOTSTRAP.md`](docs/mcp-vertex/AGENT-BOOTSTRAP.md).',
		'',
		'<!-- END GENERATED: f00056 S4 (agnostic bootstrap). -->',
		'',
	].join('\n');

beforeEach(() => {
	workspaceRoot = mkdtempSync(join(tmpdir(), 'host-hints-fragments-'));
});

afterEach(() => {
	rmSync(workspaceRoot, { recursive: true, force: true });
});

describe('host-hints-fragments lint (f00092 single fragment)', () => {
	it('HOST_HINT_FRAGMENTS lists exactly one canonical fragment', () => {
		expect(HOST_HINT_FRAGMENTS).toHaveLength(1);
		expect(HOST_HINT_FRAGMENTS).toContain(
			'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
		);
	});

	it('clean fragment passes', async () => {
		writeFragment(HOST_HINT_FRAGMENTS[0] ?? '', cleanFragment());
		const out = await lintHostHintFragment(
			HOST_HINT_FRAGMENTS[0] ?? '',
			workspaceRoot,
		);
		expect(out.exists).toBe(true);
		expect(out.violations).toEqual([]);
	});

	it('fragment without BEGIN/END markers fails with a regenerate fix', async () => {
		const tampered = cleanFragment()
			.replace('<!-- BEGIN GENERATED: f00056 S4 (agnostic bootstrap). -->', '')
			.replace('<!-- END GENERATED: f00056 S4 (agnostic bootstrap). -->', '');
		writeFragment(HOST_HINT_FRAGMENTS[0] ?? '', tampered);
		const out = await lintHostHintFragment(
			HOST_HINT_FRAGMENTS[0] ?? '',
			workspaceRoot,
		);
		expect(out.violations.length).toBeGreaterThan(0);
		expect(out.violations.some((v) => v.fix.includes('catalog:hints'))).toBe(true);
	});

	it('fragment enumerating a skill id fails (delegated to S1)', async () => {
		const content = [
			cleanFragment(),
			'',
			'See `mcp-vertex-operator` for the canonical first move.',
			'',
		].join('\n');
		writeFragment(HOST_HINT_FRAGMENTS[0] ?? '', content);
		const skillIds = new Set(['mcp-vertex-operator']);
		const out = await lintHostHintFragment(
			HOST_HINT_FRAGMENTS[0] ?? '',
			workspaceRoot,
			skillIds,
		);
		const skillViolations = out.violations.filter(
			(v) => v.kind === 'skill-id-enumeration',
		);
		expect(skillViolations.length).toBeGreaterThan(0);
		expect(skillViolations[0]?.fix).toContain('mcp-vertex_agent_catalog');
	});

	it('fragment missing the bootstrap link fails with kind=missing-bootstrap-link', async () => {
		const content = [
			'<!-- BEGIN GENERATED: foo. -->',
			'## Discovery',
			'No link to the bootstrap here.',
			'<!-- END GENERATED: foo. -->',
		].join('\n');
		writeFragment(HOST_HINT_FRAGMENTS[0] ?? '', content);
		const out = await lintHostHintFragment(
			HOST_HINT_FRAGMENTS[0] ?? '',
			workspaceRoot,
		);
		expect(
			out.violations.some((v) => v.kind === 'missing-bootstrap-link'),
		).toBe(true);
	});

	it('missing fragment file fails with exists=false and a regenerate fix', async () => {
		const out = await lintHostHintFragment(
			HOST_HINT_FRAGMENTS[0] ?? '',
			workspaceRoot,
		);
		expect(out.exists).toBe(false);
		expect(out.violations).toHaveLength(1);
		expect(out.violations[0]?.fix).toContain('catalog:hints');
	});

	it('lintAllHostHintFragments walks the single fragment against the real repo', async () => {
		const out = await lintAllHostHintFragments(REPO_ROOT);
		expect(out).toHaveLength(1);
		for (const r of out) {
			expect(r.exists).toBe(true);
			expect(r.violations).toEqual([]);
		}
	});

	it('findStrayFragments returns empty when only the canonical fragment exists', async () => {
		writeFragment(
			'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
			cleanFragment(),
		);
		const strays = await findStrayFragments(workspaceRoot);
		expect(strays).toEqual([]);
	});

	it('findStrayFragments flags any sibling *.generated.md file', async () => {
		writeFragment(
			'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
			cleanFragment(),
		);
		writeFragment(
			'docs/mcp-vertex/host-hints/claude.generated.md',
			cleanFragment(),
		);
		const strays = await findStrayFragments(workspaceRoot);
		expect(strays.map((s) => s.filename)).toEqual(['claude.generated.md']);
	});

	it('lintStrayFragments emits a stray-fragment violation with the f00092 fix', async () => {
		writeFragment(
			'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
			cleanFragment(),
		);
		writeFragment(
			'docs/mcp-vertex/host-hints/agents.generated.md',
			cleanFragment(),
		);
		const violations = await lintStrayFragments(workspaceRoot);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.kind).toBe('stray-fragment');
		expect(violations[0]?.fix).toContain('f00092');
	});

	it('the real repo holds exactly one fragment on disk and zero strays', async () => {
		const strays = await findStrayFragments(REPO_ROOT);
		expect(strays).toEqual([]);
		const out = await lintAllHostHintFragments(REPO_ROOT);
		expect(out).toHaveLength(1);
		expect(out[0]?.file).toBe(
			'docs/mcp-vertex/host-hints/agent-instructions.generated.md',
		);
	});
});
