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
	readFile: (p) => files[p],
	exists: (p) => p in files || emptyDirs.includes(p),
	listDir: (p) => {
		if (emptyDirs.includes(p)) return [];
		return p in files ? ['entry'] : [];
	},
});

describe('DEFAULT_AGENT_CONFIG_RULES (declarative table)', () => {
	it('lists the seven built-in entries (CLAUDE.md, AGENTS.md, cursor×2, copilot-instructions, github-agents, windsurf)', () => {
		const ids = DEFAULT_AGENT_CONFIG_RULES.map((r) => r.id);
		expect(ids).toContain('CLAUDE.md');
		expect(ids).toContain('AGENTS.md');
		expect(ids).toContain('cursor');
		expect(ids).toContain('copilot-instructions');
		expect(ids).toContain('github-agents');
		expect(ids).toContain('windsurf');
	});
	it('CLAUDE.md has the highest priority (the common reference)', () => {
		const claude = DEFAULT_AGENT_CONFIG_RULES.find(
			(r) => r.id === 'CLAUDE.md',
		);
		const windsurf = DEFAULT_AGENT_CONFIG_RULES.find(
			(r) => r.id === 'windsurf',
		);
		expect(claude?.priority).toBeGreaterThan(windsurf?.priority ?? 0);
	});
});

describe('matchAgentConfigs', () => {
	it('returns an empty list when no agent config is present', () => {
		expect(matchAgentConfigs(reader({}))).toEqual([]);
	});
	it('detects CLAUDE.md from the file', () => {
		expect(matchAgentConfigs(reader({ 'CLAUDE.md': '# guide' }))).toEqual([
			'CLAUDE.md',
		]);
	});
	it('detects AGENTS.md', () => {
		expect(matchAgentConfigs(reader({ 'AGENTS.md': '# guide' }))).toContain(
			'AGENTS.md',
		);
	});
	it('detects cursor from .cursorrules (file)', () => {
		expect(matchAgentConfigs(reader({ '.cursorrules': 'rule' }))).toContain(
			'cursor',
		);
	});
	it('detects cursor from .cursor (dir)', () => {
		expect(matchAgentConfigs(reader({ '.cursor': 'dir' }))).toContain(
			'cursor',
		);
	});
	it('does NOT detect cursor from .cursor when the dir is empty', () => {
		// Empty dir is not a real Cursor setup.
		expect(matchAgentConfigs(reader({}, ['.cursor']))).not.toContain(
			'cursor',
		);
	});
	it('detects copilot-instructions', () => {
		expect(
			matchAgentConfigs(
				reader({ '.github/copilot-instructions.md': '# guide' }),
			),
		).toContain('copilot-instructions');
	});
	it('detects github-agents from the .github/agents dir', () => {
		expect(
			matchAgentConfigs(reader({ '.github/agents': 'dir' })),
		).toContain('github-agents');
	});
	it('detects windsurf from .windsurfrules', () => {
		expect(
			matchAgentConfigs(reader({ '.windsurfrules': 'rule' })),
		).toContain('windsurf');
	});
	it('returns all matches in priority order for a multi-config repo', () => {
		const result = matchAgentConfigs(
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

describe('integration: detectAgentConfigs uses the rule table', () => {
	it('analyzer picks up CLAUDE.md + AGENTS.md for a dual-config project', () => {
		const analysis = analyzeProject(
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
