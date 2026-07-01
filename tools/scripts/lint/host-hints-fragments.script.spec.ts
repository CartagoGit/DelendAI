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
	lintAllHostHintFragments,
	lintHostHintFragment,
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

describe('host-hints-fragments lint', () => {
	it('HOST_HINT_FRAGMENTS lists the three canonical fragments', () => {
		expect(HOST_HINT_FRAGMENTS).toHaveLength(3);
		expect(HOST_HINT_FRAGMENTS).toContain(
			'docs/mcp-vertex/host-hints/agents.generated.md',
		);
		expect(HOST_HINT_FRAGMENTS).toContain(
			'docs/mcp-vertex/host-hints/claude.generated.md',
		);
		expect(HOST_HINT_FRAGMENTS).toContain(
			'docs/mcp-vertex/host-hints/copilot-instructions.generated.md',
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

	it('lintAllHostHintFragments walks all three fragments against the real repo', async () => {
		const out = await lintAllHostHintFragments(REPO_ROOT);
		expect(out).toHaveLength(3);
		for (const r of out) {
			expect(r.exists).toBe(true);
			expect(r.violations).toEqual([]);
		}
	});
});
