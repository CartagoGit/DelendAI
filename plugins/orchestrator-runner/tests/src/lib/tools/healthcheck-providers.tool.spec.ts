/**
 * healthcheck-providers.tool.spec.ts — the healthcheck asks an installed
 * client how it is logged in, and reports a missing one with its install
 * hint; the router's mirror and the durable snapshot follow.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IProviderCapabilities } from '@delendai/core/public';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HealthStore } from '../../../../src/lib/healthcheck/store';
import { buildHealthcheckProvidersRegistration } from '../../../../src/lib/tools/healthcheck-providers.tool';

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0))
		await rm(root, { recursive: true, force: true });
});

const provider = (id: string, command: string): IProviderCapabilities => ({
	id,
	kind: 'cli',
	invoke: { kind: 'cli', command },
	modelId: 'model-x',
	contextWindow: 0,
	costTier: 3,
	strengths: [],
	weaknesses: [],
});

describe('healthcheck_providers', () => {
	it('asks an installed client for its login and reports a missing one with its hint', async () => {
		const root = await mkdtemp(join(tmpdir(), 'healthcheck-'));
		roots.push(root);
		const asked: string[] = [];
		const health = new HealthStore();
		const registerTool = vi.fn();
		await buildHealthcheckProvidersRegistration({
			namespacePrefix: 'delendai',
			providers: [
				provider('claude', 'claude'),
				provider('codex', 'codex'),
			],
			health,
			healthcheckPath: join(root, 'health.json'),
			workspaceRoot: root,
			runner: async (command) => {
				asked.push(command);
				if (command === 'command -v claude')
					return { code: 0, output: '/bin/claude' };
				if (command === 'claude --version')
					return { code: 0, output: '2.1.0 (Claude Code)' };
				if (command.startsWith('claude '))
					return {
						code: 0,
						output: 'Logged in with a Claude Max account',
					};
				return { code: 1, output: '' };
			},
		}).register({ registerTool } as Pick<
			McpServer,
			'registerTool'
		> as McpServer);
		const handler = registerTool.mock.calls[0]?.[2] as () => Promise<{
			structuredContent?: {
				providers: {
					id: string;
					overall: string;
					installHint?: unknown;
				}[];
				summary: { total: number };
			};
		}>;
		const out = (await handler()).structuredContent;
		expect(out?.summary.total).toBe(2);
		const byId = new Map(out?.providers.map((p) => [p.id, p]));
		expect(byId.get('codex')?.overall).toBe('not-installed');
		expect(byId.get('codex')?.installHint).toBeDefined();
		expect(byId.get('claude')?.overall).not.toBe('not-installed');
		// The login was asked of the installed client only.
		expect(
			asked.some(
				(c) => c.startsWith('claude ') && c !== 'claude --version',
			),
		).toBe(true);
		expect(asked.some((c) => c.startsWith('codex '))).toBe(false);
		expect(
			JSON.parse(await readFile(join(root, 'health.json'), 'utf8')),
		).toBeDefined();
	});
});
