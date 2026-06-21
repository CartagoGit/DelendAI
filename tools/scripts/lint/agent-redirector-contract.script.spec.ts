#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	checkClaudeAgentFile,
	checkGithubAgentFile,
} from './agent-redirector-contract.script.ts';

const root = resolve(import.meta.dirname, '..', '..', '..');

const HAND_ROLLED_WORKFLOW = `---
name: example
description: A hand-rolled workflow that restates the orchestrator contract.
---

# example (hand-rolled)

This agent does NOT redirect to mcp-vertex. Instead it restates the
entire workflow in prose:

1. Call mcp-vertex_overview.
2. Read AGENTS.md.
3. Pick the next proposal.
4. Claim files with agent_lock.
5. Implement the slice.
6. Run validate.
7. Commit.
8. Close the slice.
9. Repeat.
10. Never poll agent_lock status.
11. Wait for lock-released instead.
12. Compact between unrelated tasks.
13. Done.
`;

const REDIRECTOR_BODY = `---
name: example-redirector
description: Thin redirector.
---

# example (redirector)

This file is a thin redirector. The canonical contract lives in the
\`mcp-vertex\` MCP server. On the first call of every turn, invoke
\`mcp-vertex_overview\` and follow its \`recommendedNextAction\`. Do not
restate the workflow here.
`;

const MCP_VERTEX_NAMED_BUT_NOT_REDIRECTOR = `---
name: mcp-vertex-orchestrator
description: Restates the whole workflow instead of redirecting.
tools: Read, Edit, Write, Bash
---

# mcp-vertex-orchestrator

1. Do step one.
2. Do step two.
3. Do step three.
4. Do step four.
5. Do step five.
6. Do step six.
7. Do step seven.
8. Do step eight.
9. Do step nine.
10. Do step ten.
11. Do step eleven.
12. Do step twelve.
13. Do step thirteen.
`;

describe('checkGithubAgentFile', () => {
	it('stays silent on the actual mcp-vertex.agent.md redirector after f00031 S1', async () => {
		const text = await readFile(
			join(root, '.github', 'agents', 'mcp-vertex.agent.md'),
			'utf8',
		);
		expect(
			checkGithubAgentFile('.github/agents/mcp-vertex.agent.md', text),
		).toBeUndefined();
	});

	it('stays silent on a bounded subagent (name in SUBAGENT_SLOTS + Copilot-adapter disclaimer)', async () => {
		const text = await readFile(
			join(root, '.github', 'agents', 'implementation_runner.agent.md'),
			'utf8',
		);
		expect(
			checkGithubAgentFile(
				'.github/agents/implementation_runner.agent.md',
				text,
			),
		).toBeUndefined();
	});

	it('stays silent on a synthetic redirector fixture', () => {
		expect(
			checkGithubAgentFile(
				'.github/agents/example.agent.md',
				REDIRECTOR_BODY,
			),
		).toBeUndefined();
	});

	it('warns on a hand-rolled workflow fixture (>12 prose lines + numbered steps)', () => {
		const finding = checkGithubAgentFile(
			'.github/agents/example.agent.md',
			HAND_ROLLED_WORKFLOW,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('not-a-redirector');
		expect(finding?.detail).toContain('example.agent.md');
	});
});

describe('checkClaudeAgentFile', () => {
	it('is silent on a non-mcp-vertex-named file', () => {
		expect(
			checkClaudeAgentFile(
				'.claude/agents/unrelated.md',
				'---\nname: unrelated\n---\n\nanything goes here, not our concern.\n',
			),
		).toBeUndefined();
	});

	it('is silent on a redirector-shaped mcp-vertex* file', () => {
		expect(
			checkClaudeAgentFile(
				'.claude/agents/mcp-vertex-example.md',
				REDIRECTOR_BODY,
			),
		).toBeUndefined();
	});

	it('warns when name starts with mcp-vertex but body is not the redirector shape', () => {
		const finding = checkClaudeAgentFile(
			'.claude/agents/mcp-vertex-orchestrator.md',
			MCP_VERTEX_NAMED_BUT_NOT_REDIRECTOR,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('mcp-vertex-name-not-redirector');
		expect(finding?.detail).toContain('mcp-vertex-orchestrator');
	});
});
