// agent-config-rules.spec.ts: pin the SOLID agent-config table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@mcp-vertex/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_AGENT_CONFIG_RULES,
	matchAgentConfigs,
} from '@mcp-vertex/core/lib/bootstrap/agent-config-rules';

/**
 * The reader mock:
 *   - `files` lists every path that exists; each value is the
 *     file content (or "dir" for directories that should report
 *     one entry to `listDir`).
 *   - `emptyDirs` lists paths that exist as directories with NO
 *     entries (returns `[]` to `listDir`, `true` to `exists`).
 *   - Everything else: not present.
 */
const reader = (
	files: Record<string, string> = {},
	emptyDirs: readonly string[] = [],
): IFileReader => ({
	readFile: async (p) => files[p],
	exists: async (p) => p in files || emptyDirs.includes(p),
	listDir: async (p) => {
		if (emptyDirs.includes(p)) return [];
		return p in files ? ['entry'] : [];
	},
});

describe('DEFAULT_AGENT_CONFIG_RULES (declarative table)', async () => {
	it('lists the six built-in entries (CLAUDE.md, AGENTS.md, cursor, copilot-instructions, github-agents, windsurf)', async () => {
		// The cursor case is now ONE rule with a `paths: [...]`
		// array, not two rules with the same id. The unique-id
		// contract holds.
		const ids = DEFAULT_AGENT_CONFIG_RULES.map((r) => r.id);
		expect(ids).toEqual([
			'CLAUDE.md',
			'AGENTS.md',
			'cursor',
			'copilot-instructions',
			'github-agents',
			'windsurf',
		]);
	});
	it('every id is unique (the strict contract — no tolerated duplicates)', async () => {
		const ids = DEFAULT_AGENT_CONFIG_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('CLAUDE.md has the highest priority (the common reference)', async () => {
		const claude = DEFAULT_AGENT_CONFIG_RULES.find(
			(r) => r.id === 'CLAUDE.md',
		);
		const windsurf = DEFAULT_AGENT_CONFIG_RULES.find(
			(r) => r.id === 'windsurf',
		);
		expect(claude?.priority).toBeGreaterThan(windsurf?.priority ?? 0);
	});
});

describe('matchAgentConfigs', async () => {
	it('returns an empty list when no agent config is present', async () => {
		expect(await matchAgentConfigs(reader({}))).toEqual([]);
	});
	it('detects CLAUDE.md from the file', async () => {
		expect(
			await matchAgentConfigs(reader({ 'CLAUDE.md': '# guide' })),
		).toEqual(['CLAUDE.md']);
	});
	it('detects AGENTS.md', async () => {
		expect(
			await matchAgentConfigs(reader({ 'AGENTS.md': '# guide' })),
		).toContain('AGENTS.md');
	});
	it('detects cursor from .cursorrules (file)', async () => {
		expect(
			await matchAgentConfigs(reader({ '.cursorrules': 'rule' })),
		).toContain('cursor');
	});
	it('detects cursor from .cursor (dir)', async () => {
		expect(await matchAgentConfigs(reader({ '.cursor': 'dir' }))).toContain(
			'cursor',
		);
	});
	it('does NOT detect cursor when there is no .cursorrules and no .cursor', async () => {
		// When neither `.cursorrules` nor `.cursor` exists, no cursor
		// config is detected. (The `file-or-dir` rule for the empty
		// dir case is intentionally permissive — see the
		// `agent-config-rules.ts` comment — so we only assert the
		// clear no-evidence case here.)
		expect(await matchAgentConfigs(reader({}))).not.toContain('cursor');
	});
	it('detects copilot-instructions', async () => {
		expect(
			await matchAgentConfigs(
				reader({ '.github/copilot-instructions.md': '# guide' }),
			),
		).toContain('copilot-instructions');
	});
	it('detects github-agents from the .github/agents dir', async () => {
		expect(
			await matchAgentConfigs(reader({ '.github/agents': 'dir' })),
		).toContain('github-agents');
	});
	it('detects windsurf from .windsurfrules', async () => {
		expect(
			await matchAgentConfigs(reader({ '.windsurfrules': 'rule' })),
		).toContain('windsurf');
	});
	it('returns all matches in priority order for a multi-config repo', async () => {
		const result = await matchAgentConfigs(
			reader({
				'CLAUDE.md': '# claude',
				'AGENTS.md': '# agents',
				'.windsurfrules': 'rule',
			}),
		);
		// Priority order: CLAUDE.md > AGENTS.md > windsurf.
		expect(result).toEqual(['CLAUDE.md', 'AGENTS.md', 'windsurf']);
	});
});

describe('integration: detectAgentConfigs uses the rule table', async () => {
	it('analyzer picks up CLAUDE.md + AGENTS.md for a dual-config project', async () => {
		const analysis = await analyzeProject(
			reader({
				'CLAUDE.md': '# claude',
				'AGENTS.md': '# agents',
				'package.json': '{"name":"svc"}',
			}),
		);
		expect(analysis.agentConfigs).toContain('CLAUDE.md');
		expect(analysis.agentConfigs).toContain('AGENTS.md');
	});
});
