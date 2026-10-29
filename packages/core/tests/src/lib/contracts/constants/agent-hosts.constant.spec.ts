import { describe, expect, it } from 'vitest';

import {
	AGENT_HOST_APPLICATIONS,
	AGENT_HOST_CHAT_PRODUCTS,
	AGENT_HOST_SLUGS,
	AGENT_HOSTS,
} from '../../../../../src/lib/contracts/constants/agent-hosts.constant';
import {
	AGENT_HOST_MARKER_PREFIXES,
	AGENT_HOST_MARKERS,
	CROSS_RUNTIME_AGENT_MARKER,
} from '../../../../../src/lib/contracts/constants/agent-environment.constant';
import { kindInAgent } from '../../../../../src/lib/work-units/work-unit-shared.service';

describe('AGENT_HOSTS is the one host source', () => {
	it('derives the lists that were kept beside it, with the same names', () => {
		expect([...AGENT_HOST_APPLICATIONS].sort()).toEqual(
			[
				'copilot',
				'github-copilot',
				'github-copilot-chat',
				'vscode',
				'visual-studio-code',
				'code',
				'claude-code',
				'cursor',
				'windsurf',
				'cline',
				'roo',
				'roo-code',
				'kilo',
				'kilo-code',
				'continue',
				'aider',
				'opencode',
				'codex',
				'codex-cli',
				'codex-mcp-client',
				'gemini-cli',
				'zed',
				'mcp-inspector',
			].sort(),
		);
		expect(AGENT_HOST_MARKERS[0]).toBe(CROSS_RUNTIME_AGENT_MARKER);
		expect([...AGENT_HOST_MARKERS].sort()).toEqual(
			[
				CROSS_RUNTIME_AGENT_MARKER,
				'CLAUDECODE',
				'CLAUDE_CODE_ENTRYPOINT',
				'GEMINI_CLI',
				'OPENCODE',
			].sort(),
		);
		expect(AGENT_HOST_MARKER_PREFIXES).toEqual(['CODEX_', 'CURSOR_']);
		expect([...AGENT_HOST_CHAT_PRODUCTS].sort()).toEqual(
			[
				'Code',
				'Code - Insiders',
				'Cursor',
				'VSCodium',
				'Windsurf',
			].sort(),
		);
		expect(AGENT_HOST_SLUGS).toEqual({
			'vscode-copilot': 'copilot',
			'claude-code': 'claude-code',
			'codex-cli': 'codex-cli',
			cursor: 'cursor',
			continue: 'continue',
			aider: 'aider',
		});
	});

	it('refuses every declared host program as an agent id', () => {
		for (const host of AGENT_HOSTS)
			for (const application of host.identity?.applications ?? [])
				expect(kindInAgent(application), application).toBeDefined();
	});

	it('gives each host one id', () => {
		const ids = AGENT_HOSTS.map((host) => host.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});
