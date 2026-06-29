/**
 * host-instructions.script.spec.ts — f00084 S1 acceptance.
 *
 * Pin the contract:
 *   - clean host files pass
 *   - host files missing the bootstrap link fail
 *   - host files enumerating skill / tool / proposal ids fail with the
 *     right line number and next-action message
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	HOST_FILES,
	lintAllHostFiles,
	lintHostFile,
} from './host-instructions.script.ts';

let workspaceRoot = '';
let skillIds: ReadonlySet<string> = new Set();

beforeEach(() => {
	workspaceRoot = mkdtempSync(join(tmpdir(), 'host-instructions-'));
	// Load the real skill manifest from the repo so the lint can distinguish
	// mcp-vertex-* skill ids from similarly-shaped lint-script names.
	skillIds = new Set([
		'mcp-vertex-operator',
		'mcp-vertex-plugin-authoring',
		'mcp-vertex-failure-modes',
		'mcp-vertex-conventional-commits-and-release',
		'mcp-vertex-token-budget-playbook',
		'mcp-vertex-mcp-vertex-audit-playbook',
		'mcp-vertex-mcp-vertex-audit-runner',
		'mcp-vertex-concurrency-patterns',
		'mcp-vertex-legacy-proposal-migration',
		'mcp-vertex-multi-agent-coordination',
		'mcp-vertex-proposal-swarm-runner',
		'mcp-vertex-proposals-workflow-playbook',
		'mcp-vertex-status-marker-and-closure',
		'mcp-vertex-tabs-component',
	]);
});

afterEach(() => {
	rmSync(workspaceRoot, { recursive: true, force: true });
});

const writeHostFile = (file: string, contents: string): void => {
	const parts = file.split('/');
	if (parts.length > 1) {
		// create parent dirs
		let dir = workspaceRoot;
		for (let i = 0; i < parts.length - 1; i += 1) {
			dir = join(dir, parts[i] ?? '');
		}
		mkdirSync(dir, { recursive: true });
	}
	writeFileSync(join(workspaceRoot, file), contents, 'utf8');
};

const CLEAN_HOST_FILE = (suffix: string): string => `# Host

> Follow docs/mcp-vertex/AGENT-BOOTSTRAP.md ${suffix}

All agent rules live in that file. Do not enumerate tool or skill ids.
Use \`mcp-vertex_overview\` to orient, then \`mcp-vertex_agent_catalog\` to route.
`;

describe('host-instructions lint', () => {
	it('HOST_FILES lists the three canonical host files', () => {
		expect(new Set(HOST_FILES)).toEqual(
			new Set([
				'AGENTS.md',
				'CLAUDE.md',
				'.github/copilot-instructions.md',
			]),
		);
	});

	it('clean host file passes', async () => {
		writeHostFile('AGENTS.md', CLEAN_HOST_FILE('context'));
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		expect(violations).toEqual([]);
	});

	it('host file missing the bootstrap link fails with the right next-action', async () => {
		writeHostFile('AGENTS.md', '# Host\n\nNo bootstrap link here.\n');
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		const missing = violations.find(
			(v) => v.kind === 'missing-bootstrap-link',
		);
		expect(missing).toBeDefined();
		expect(missing?.fix).toContain('docs/mcp-vertex/AGENT-BOOTSTRAP.md');
	});

	it('host file enumerating a skill id fails with the right line number', async () => {
		const content = `# Host

> Follow docs/mcp-vertex/AGENT-BOOTSTRAP.md

Use \`mcp-vertex-operator\` whenever you start a session.
`;
		writeHostFile('AGENTS.md', content);
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		const skill = violations.find((v) => v.kind === 'skill-id-enumeration');
		expect(skill).toBeDefined();
		expect(skill?.line).toBe(5);
		// The fix message contains the skill id; we check the violation
		// directly so the snippet truncation does not bite us.
		expect(skill?.snippet).toContain('mcp-vertex-operator');
	});

	it('host file enumerating a tool id (non-bootstrap entry point) fails', async () => {
		const content = `# Host

> Follow docs/mcp-vertex/AGENT-BOOTSTRAP.md

Call \`mcp-vertex_proposals_auto_work\` for orchestration.
`;
		writeHostFile('AGENTS.md', content);
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		const tool = violations.find((v) => v.kind === 'tool-id-enumeration');
		expect(tool).toBeDefined();
		expect(tool?.fix).toContain('mcp-vertex_proposals_auto_work');
	});

	it('host file mentioning bootstrap entry points passes', async () => {
		const content = `# Host

> Follow docs/mcp-vertex/AGENT-BOOTSTRAP.md

Call \`mcp-vertex_overview\` then \`mcp-vertex_agent_catalog\`. Use the bootstrap prompt \`mcp-vertex_agent_bootstrap\` if the host surfaces prompts.
`;
		writeHostFile('AGENTS.md', content);
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		expect(violations).toEqual([]);
	});

	it('host file enumerating a proposal id fails', async () => {
		const content = `# Host

> Follow docs/mcp-vertex/AGENT-BOOTSTRAP.md

See also \`f00056\` and \`f00084\`.
`;
		writeHostFile('AGENTS.md', content);
		const violations = await lintHostFile(
			'AGENTS.md',
			workspaceRoot,
			skillIds,
		);
		const proposals = violations.filter(
			(v) => v.kind === 'proposal-id-enumeration',
		);
		// Both ids land on the same line; the lint emits one violation per
		// match, so we expect two.
		expect(proposals.length).toBe(2);
		expect(proposals.every((v) => v.line === 5)).toBe(true);
	});

	it('lintAllHostFiles walks all three files', async () => {
		writeHostFile('AGENTS.md', CLEAN_HOST_FILE('a'));
		writeHostFile('CLAUDE.md', CLEAN_HOST_FILE('b'));
		writeHostFile('.github/copilot-instructions.md', CLEAN_HOST_FILE('c'));
		const violations = await lintAllHostFiles(workspaceRoot);
		expect(violations).toEqual([]);
	});

	it('CLAUDE.md pointing at AGENTS.md instead of bootstrap fails', async () => {
		// regression test for the 2026-06-28 formatter regression:
		// CLAUDE.md must point at the bootstrap directly, not at AGENTS.md.
		const content = `# CLAUDE.md

Canonical rules live in [\`AGENTS.md\`](AGENTS.md) — read that first.
`;
		writeHostFile('CLAUDE.md', content);
		const violations = await lintHostFile(
			'CLAUDE.md',
			workspaceRoot,
			skillIds,
		);
		const missing = violations.find(
			(v) => v.kind === 'missing-bootstrap-link',
		);
		expect(missing).toBeDefined();
	});
});
