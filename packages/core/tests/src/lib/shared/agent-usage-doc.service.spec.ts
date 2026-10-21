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
import {
	renderAgentUsagePage,
	USAGE_PAGES_DIR,
	writeAgentUsagePage,
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
			evidence: 'opencode is on /home/me/bin',
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
		expect(page).not.toContain('/home/me');
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
