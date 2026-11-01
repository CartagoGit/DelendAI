// agent-config-rules.spec.ts: pin the SOLID agent-config table.

import { describe, expect, it } from 'vitest';

import { analyzeProject } from '@delendai/core/lib/bootstrap/analyze-project';
import type { IFileReader } from '@delendai/core/lib/bootstrap/analyze-project';
import {
	DEFAULT_AGENT_CONFIG_RULES,
	matchAgentConfigs,
} from '@delendai/core/lib/bootstrap/agent-config-rules';
import { AGENT_HOSTS } from '@delendai/core/lib/contracts/constants/agent-hosts.constant';

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

describe('DEFAULT_AGENT_CONFIG_RULES (read from AGENT_HOSTS)', async () => {
	it('has a rule for every instructions file and agents folder a host declares, and no other', async () => {
		const ids = DEFAULT_AGENT_CONFIG_RULES.map((r) => r.id);
		const declared = AGENT_HOSTS.flatMap((host) => [
			...(host.instructions === undefined ? [] : [host.instructions]),
			...(host.legacyInstructions ?? []),
			...(host.agents === undefined ? [] : [host.agents.dir]),
		]);
		expect(new Set(ids)).toEqual(new Set(declared));
	});
	it('every id is unique (the strict contract — no tolerated duplicates)', async () => {
		const ids = DEFAULT_AGENT_CONFIG_RULES.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
	it('ranks an earlier host first: CLAUDE.md above .windsurfrules', async () => {
		const priority = (id: string): number =>
			DEFAULT_AGENT_CONFIG_RULES.find((r) => r.id === id)?.priority ?? 0;
		expect(priority('CLAUDE.md')).toBeGreaterThan(
			priority('.windsurfrules'),
		);
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
		).toContain('.cursorrules');
	});
	it('detects the rules file delendai writes for Cursor', async () => {
		expect(
			await matchAgentConfigs(
				reader({ '.cursor/rules/delendai.mdc': 'rule' }),
			),
		).toContain('.cursor/rules/delendai.mdc');
	});
	it('detects nothing for Cursor when neither of its files exists', async () => {
		const found = await matchAgentConfigs(reader({}));
		expect(found).not.toContain('.cursorrules');
		expect(found).not.toContain('.cursor/rules/delendai.mdc');
	});
	it('detects the Copilot instructions file', async () => {
		expect(
			await matchAgentConfigs(
				reader({ '.github/copilot-instructions.md': '# guide' }),
			),
		).toContain('.github/copilot-instructions.md');
	});
	it('detects the .github/agents folder', async () => {
		expect(
			await matchAgentConfigs(reader({ '.github/agents': 'dir' })),
		).toContain('.github/agents');
	});
	it('detects .windsurfrules', async () => {
		expect(
			await matchAgentConfigs(reader({ '.windsurfrules': 'rule' })),
		).toContain('.windsurfrules');
	});
	it('returns all matches in priority order for a multi-config repo', async () => {
		const result = await matchAgentConfigs(
			reader({
				'CLAUDE.md': '# claude',
				'AGENTS.md': '# agents',
				'.windsurfrules': 'rule',
			}),
		);
		// The order hosts are declared in: Claude, Codex, then Windsurf.
		expect(result).toEqual(['CLAUDE.md', 'AGENTS.md', '.windsurfrules']);
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
