import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildAgentLockRegistration } from '@mcp-vertex/proposals/lib/tools/agent-lock.tool';

/**
 * f00082 S3: `agent_lock` re-echoes the composite identity it is called
 * with in the response `identity` block, so a caller can attribute the
 * lock op to a (host, model, agent, task) without consulting the
 * registry. The echo is purely informational — it never affects the
 * lock semantics.
 */
type Handler = (a: unknown) => Promise<{
	content: Array<{ text: string }>;
	structuredContent?: Record<string, unknown>;
	isError?: boolean;
}>;

const capture = async (reg: IToolRegistration): Promise<Handler> => {
	let handler: Handler;
	await reg.register({
		registerTool: (_n: string, _d: unknown, h: Handler) => {
			handler = h;
		},
	} as never);
	return handler!;
};

describe('agent_lock — f00082 identity echo', () => {
	let dir = '';
	let lockPath = '';

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'agent-lock-identity-'));
		lockPath = join(dir, 'agents.lock.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('echoes host/model/agent/task in the identity block on claim', async () => {
		const handler = await capture(
			buildAgentLockRegistration({
				namespacePrefix: 'proposals',
				lockPathAbs: lockPath,
				lockFileLabel: 'agents.lock.json',
			}),
		);
		const res = await handler({
			action: 'claim',
			task_id: 'f00078',
			agent: 'orion',
			files: ['src/a.ts'],
			host: 'vscode-copilot',
			model: 'm3',
		});
		expect(res.isError).not.toBe(true);
		expect(res.structuredContent?.identity).toEqual({
			host: 'vscode-copilot',
			model: 'm3',
			agent_name: 'orion',
			task_id: 'f00078',
		});
		// text payload mirrors structuredContent so both carry the echo
		const text = JSON.parse(res.content[0]?.text ?? '{}') as {
			identity?: unknown;
		};
		expect(text.identity).toEqual(res.structuredContent?.identity);
	});

	it('omits the identity block entirely when no identity fields are passed', async () => {
		const handler = await capture(
			buildAgentLockRegistration({
				namespacePrefix: 'proposals',
				lockPathAbs: lockPath,
				lockFileLabel: 'agents.lock.json',
			}),
		);
		const res = await handler({
			action: 'status',
		});
		expect(res.structuredContent?.identity).toBeUndefined();
	});
});
