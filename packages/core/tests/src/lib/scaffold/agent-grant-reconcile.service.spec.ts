import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { reconcileAgentGrants } from '../../../../src/lib/scaffold/agent-grant-reconcile.service';

const agent = (name: string, tools: string): string =>
	`---\nname: ${name}\ndescription: d\ntools: [${tools}]\n---\n\n# body\n`;

describe('reconcileAgentGrants', () => {
	let root: string;
	const write = (path: string, text: string) => {
		mkdirSync(join(root, path, '..'), { recursive: true });
		writeFileSync(join(root, path), text);
	};
	const read = (path: string) => readFileSync(join(root, path), 'utf8');
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'agent-grants-'));
		write(
			'.vscode/mcp.json',
			JSON.stringify({
				servers: {
					'Acme Tools': {
						command: 'npx',
						args: ['-y', '@delendai/core'],
					},
					github: { command: 'gh-mcp' },
				},
			}),
		);
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('replaces a grant of a server that is no longer registered', async () => {
		write(
			'.github/agents/acme-runner.agent.md',
			agent('acme-runner', 'read, edit, DelendAI/*, github/*'),
		);
		const changes = await reconcileAgentGrants({
			root,
			namespacePrefix: 'acme',
		});
		expect(changes).toEqual([
			{
				path: '.github/agents/acme-runner.agent.md',
				removed: ['DelendAI/*'],
				granted: 'acme-tools/*',
			},
		]);
		expect(read('.github/agents/acme-runner.agent.md')).toContain(
			'tools: [read, edit, github/*, acme-tools/*]',
		);
	});

	it('leaves an agent in line, and agents it did not name, untouched', async () => {
		write(
			'.github/agents/acme.agent.md',
			agent('acme', 'read, acme-tools/*'),
		);
		write('.github/agents/other.agent.md', agent('other', 'read, gone/*'));
		expect(
			await reconcileAgentGrants({ root, namespacePrefix: 'acme' }),
		).toEqual([]);
		expect(read('.github/agents/other.agent.md')).toContain('gone/*');
	});

	it('only reports when told not to apply', async () => {
		write('.github/agents/acme.agent.md', agent('acme', 'read'));
		const changes = await reconcileAgentGrants({
			root,
			namespacePrefix: 'acme',
			apply: false,
		});
		expect(changes).toHaveLength(1);
		expect(read('.github/agents/acme.agent.md')).toContain('tools: [read]');
	});

	it('does nothing when the project registers no delendai server', async () => {
		write(
			'.vscode/mcp.json',
			JSON.stringify({ servers: { github: { command: 'gh' } } }),
		);
		write(
			'.github/agents/acme.agent.md',
			agent('acme', 'read, DelendAI/*'),
		);
		expect(
			await reconcileAgentGrants({ root, namespacePrefix: 'acme' }),
		).toEqual([]);
	});
});
