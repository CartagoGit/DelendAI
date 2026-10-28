/**
 * agent-usage-doc.service.spec.ts — an agent's usage page, built from what
 * it says about itself, rewritten when that changes, keeping the person's
 * notes and never touching a page written by hand.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { IAcpIntroduction } from '../../../../src/lib/contracts/interfaces/acp.interface';
import type { IKnownAgent } from '../../../../src/lib/contracts/interfaces/declared-agent.interface';
import { USAGE_PAGES_DIR } from '../../../../src/lib/contracts/constants/agent-usage-doc.constant';
import {
	renderAgentUsagePage,
	renderProviderUsagePage,
	writeAgentUsagePage,
	writeProviderUsagePage,
} from '../../../../src/lib/shared/agent-usage-doc.service';

const agent: IKnownAgent = {
	id: 'opencode',
	name: 'OpenCode',
	kind: 'acp',
	origin: 'detected',
	launch: { command: 'opencode', args: ['acp'] },
	found: [
		{
			name: 'OpenCode',
			foundIn: 'path',
			evidence: 'opencode is on ~/bin',
		},
	],
};
const intro = (version: string): IAcpIntroduction => ({
	agent: { name: 'OpenCode', version },
	protocolVersion: 1,
	authMethods: ['opencode-login'],
	loadSession: true,
	promptCapabilities: ['image'],
});

describe('renderAgentUsagePage', () => {
	it('says how the agent is reached and what it says it is, and nothing of the machine', () => {
		const page = renderAgentUsagePage({
			agent,
			introduction: intro('1.19.3'),
		});
		expect(page).toContain('started with `opencode acp`');
		expect(page).toContain('**Version written for**: 1.19.3');
		expect(page).toContain('`opencode-login`');
		expect(page).toContain('text, image');
		expect(page).not.toContain('~/bin');
	});

	it('says how to ask an agent that was not greeted yet, and lists declared key variables', () => {
		const page = renderAgentUsagePage({
			agent: {
				...agent,
				launch: undefined,
				declared: {
					id: 'opencode',
					kind: 'cli',
					command: 'oc',
					keyVariables: ['OC_KEY'],
				},
			},
		});
		expect(page).toContain('delendai agents show opencode');
		expect(page).toContain('`OC_KEY`');
	});
});

describe('writeAgentUsagePage', () => {
	it('writes once, rewrites on a new version keeping the notes, and leaves a hand page alone', async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'usage-'));
		const first = await writeAgentUsagePage({
			workspace,
			agent,
			introduction: intro('1.0'),
		});
		expect(first).toMatchObject({ written: true, reason: 'new' });
		expect(
			(
				await writeAgentUsagePage({
					workspace,
					agent,
					introduction: intro('1.0'),
				})
			).reason,
		).toBe('unchanged');
		const page = readFileSync(first.path, 'utf8').replace(
			'Anything written here is kept when the page is regenerated.',
			'Use the build mode for refactors.',
		);
		writeFileSync(first.path, page);
		const next = await writeAgentUsagePage({
			workspace,
			agent,
			introduction: intro('2.0'),
		});
		expect(next.reason).toBe('its version or declaration changed');
		const rewritten = readFileSync(first.path, 'utf8');
		expect(rewritten).toContain('2.0');
		expect(rewritten).toContain('Use the build mode for refactors.');
		mkdirSync(join(workspace, USAGE_PAGES_DIR), { recursive: true });
		const hand = join(workspace, USAGE_PAGES_DIR, 'mine.md');
		writeFileSync(hand, '# my notes');
		const kept = await writeAgentUsagePage({
			workspace,
			agent: { ...agent, id: 'mine' },
		});
		expect(kept).toMatchObject({
			written: false,
			reason: 'a page written by hand is never replaced',
		});
		expect(readFileSync(hand, 'utf8')).toBe('# my notes');
	});
});

describe("a model provider's usage page", () => {
	const provider = {
		id: 'zai',
		name: 'Z.AI',
		env: ['ZHIPU_API_KEY', 'ZAI_API_KEY'],
		models: ['glm-5', 'glm-5.3'],
		api: 'https://api.z.ai/api/paas/v4',
		npm: '@ai-sdk/openai-compatible',
	};

	it('says how it is reached, how it logs in and its models, from its entry alone', () => {
		const page = renderProviderUsagePage({
			provider,
			catalogueDate: '2026-10-27T00:00:00.000Z',
		});
		expect(page).toContain('# Z.AI');
		expect(page).toContain(
			'the `@ai-sdk/openai-compatible` family at https://api.z.ai/api/paas/v4',
		);
		expect(page).toContain('a key in `ZHIPU_API_KEY`, `ZAI_API_KEY`');
		expect(page).toContain('`glm-5`, `glm-5.3`');
		expect(page).toContain(
			'the model catalogue of 2026-10-27T00:00:00.000Z',
		);
	});

	it("is written beside the agents' pages, keeps the person's notes, and is rewritten only on change", async () => {
		const workspace = mkdtempSync(join(tmpdir(), 'provider-page-'));
		const first = await writeProviderUsagePage({ workspace, provider });
		expect(first.written).toBe(true);
		expect(first.path).toBe(join(workspace, 'docs/delendai/models/zai.md'));
		const page = readFileSync(first.path, 'utf8').replace(
			'Anything written here is kept when the page is regenerated.',
			'Our proxy needs the VPN.',
		);
		writeFileSync(first.path, page);
		expect(
			(await writeProviderUsagePage({ workspace, provider })).written,
		).toBe(false);
		const changed = await writeProviderUsagePage({
			workspace,
			provider: { ...provider, models: ['glm-6'] },
		});
		expect(changed.written).toBe(true);
		expect(readFileSync(first.path, 'utf8')).toContain(
			'Our proxy needs the VPN.',
		);
	});
});
