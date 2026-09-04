#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	checkCanonicalRedirectorPresent,
	checkClaudeAgentFile,
	checkGithubAgentFile,
	isFatalFinding,
} from './agent-redirector-contract.script.ts';

const root = resolve(import.meta.dirname, '..', '..', '..');

const HAND_ROLLED_WORKFLOW = `---
name: example
description: A hand-rolled workflow that restates the orchestrator contract.
---

# example (hand-rolled)

This agent does NOT redirect to delendai. Instead it restates the
entire workflow in prose:

1. Call delendai_overview.
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
\`delendai\` MCP server. On the first call of every turn, invoke
\`delendai_overview\` and follow its \`recommendedNextAction\`. Do not
restate the workflow here.
`;

const DELENDAI_NAMED_BUT_NOT_REDIRECTOR = `---
name: delendai-orchestrator
description: Restates the whole workflow instead of redirecting.
tools: Read, Edit, Write, Bash
---

# delendai-orchestrator

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

describe('checkGithubAgentFile', async () => {
	it('stays silent on the actual delendai.agent.md redirector after f00031 S1', async () => {
		const text = await readFile(
			join(root, '.github', 'agents', 'delendai.agent.md'),
			'utf8',
		);
		expect(
			checkGithubAgentFile('.github/agents/delendai.agent.md', text),
		).toBeUndefined();
	});

	it('stays silent on a bounded subagent (name in SUBAGENT_SLOTS + Copilot-adapter disclaimer)', async () => {
		const text = await readFile(
			join(
				root,
				'.github',
				'agents',
				'delendai-implementation-runner.agent.md',
			),
			'utf8',
		);
		expect(
			checkGithubAgentFile(
				'.github/agents/delendai-implementation-runner.agent.md',
				text,
			),
		).toBeUndefined();
	});

	it('warns when a bounded subagent filename does not match the namespaced shape', async () => {
		const text = await readFile(
			join(
				root,
				'.github',
				'agents',
				'delendai-implementation-runner.agent.md',
			),
			'utf8',
		);
		const finding = checkGithubAgentFile(
			'.github/agents/implementation_runner.agent.md',
			text,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('subagent-filename-mismatch');
		expect(finding?.detail).toContain(
			'.github/agents/delendai-implementation-runner.agent.md',
		);
	});

	it('stays silent on a synthetic redirector fixture', async () => {
		expect(
			checkGithubAgentFile(
				'.github/agents/example.agent.md',
				REDIRECTOR_BODY,
			),
		).toBeUndefined();
	});

	it('warns on a hand-rolled workflow fixture (>12 prose lines + numbered steps)', async () => {
		const finding = checkGithubAgentFile(
			'.github/agents/example.agent.md',
			HAND_ROLLED_WORKFLOW,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('not-a-redirector');
		expect(finding?.detail).toContain('example.agent.md');
	});
});

describe('checkGithubAgentFile — user-invocable (x00201 S3)', () => {
	const BOUNDED_SUBAGENT_BODY = `---
name: implementation_runner
description: Bounded subagent.
tools: [read, search, edit, execute, todo, mcp-project-acme/*]
user-invocable: true
---

# implementation_runner

This file is only the Copilot adapter; the agent contract lives in \`mcp-project-acme\`.
`;

	it('fails a bounded subagent that still declares user-invocable: true', () => {
		const finding = checkGithubAgentFile(
			'.github/agents/delendai-implementation-runner.agent.md',
			BOUNDED_SUBAGENT_BODY,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('subagent-user-invocable-not-false');
		expect(isFatalFinding(finding?.kind as never)).toBe(true);
	});

	it('is silent once user-invocable: false is set', () => {
		const compliant = BOUNDED_SUBAGENT_BODY.replace(
			'user-invocable: true',
			'user-invocable: false',
		);
		expect(
			checkGithubAgentFile(
				'.github/agents/delendai-implementation-runner.agent.md',
				compliant,
			),
		).toBeUndefined();
	});
});

describe('checkCanonicalRedirectorPresent (x00201 S3)', () => {
	it('fails when delendai.agent.md is absent from the listing', () => {
		const finding = checkCanonicalRedirectorPresent([
			'delendai-delivery-verifier.agent.md',
			'delendai-implementation-runner.agent.md',
		]);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('missing-redirector');
		expect(isFatalFinding(finding?.kind as never)).toBe(true);
	});

	it('is silent when delendai.agent.md is present', () => {
		expect(
			checkCanonicalRedirectorPresent([
				'delendai.agent.md',
				'delendai-implementation-runner.agent.md',
			]),
		).toBeUndefined();
	});
});

describe('isFatalFinding (x00201 S3)', () => {
	it('treats pre-existing advisory kinds as non-fatal', () => {
		expect(isFatalFinding('not-a-redirector')).toBe(false);
		expect(isFatalFinding('delendai-name-not-redirector')).toBe(false);
		expect(isFatalFinding('subagent-filename-mismatch')).toBe(false);
	});

	it('treats the two new contract-breaking kinds as fatal', () => {
		expect(isFatalFinding('missing-redirector')).toBe(true);
		expect(isFatalFinding('subagent-user-invocable-not-false')).toBe(true);
	});
});

describe('checkClaudeAgentFile', async () => {
	it('is silent on a non-delendai-named file', async () => {
		expect(
			checkClaudeAgentFile(
				'.claude/agents/unrelated.md',
				'---\nname: unrelated\n---\n\nanything goes here, not our concern.\n',
			),
		).toBeUndefined();
	});

	it('is silent on a redirector-shaped delendai* file', async () => {
		expect(
			checkClaudeAgentFile(
				'.claude/agents/delendai-example.md',
				REDIRECTOR_BODY,
			),
		).toBeUndefined();
	});

	it('warns when name starts with delendai but body is not the redirector shape', async () => {
		const finding = checkClaudeAgentFile(
			'.claude/agents/delendai-orchestrator.md',
			DELENDAI_NAMED_BUT_NOT_REDIRECTOR,
		);
		expect(finding).toBeDefined();
		expect(finding?.kind).toBe('delendai-name-not-redirector');
		expect(finding?.detail).toContain('delendai-orchestrator');
	});
});
