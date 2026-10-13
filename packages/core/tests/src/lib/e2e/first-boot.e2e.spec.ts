/**
 * A consumer project, as a host starts delendai in it: the real CLI over
 * stdio, in a throwaway Git repository that is not this one. This
 * repository's own setup hides every "delendai assumes our shape" defect,
 * so the four starts below are made where those defects show: an empty
 * project, a project shipping its own plugin, a changed configuration and
 * a server renamed in the editor, under a name with upper case and spaces.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = resolve('packages/cli/src/index.ts');

const registerServer = (root: string, name: string): void =>
	writeFileSync(
		join(root, '.vscode/mcp.json'),
		JSON.stringify({
			servers: {
				[name]: {
					command: 'bunx',
					args: ['--package', '@delendai/cli', 'delendai', '__serve'],
				},
			},
		}),
	);

/** Starts the server once, lists its tools, and returns what it said. */
const start = async (root: string, name: string): Promise<string> => {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env))
		if (value !== undefined && !['CLAUDECODE', 'AI_AGENT'].includes(key))
			env[key] = value;
	const transport = new StdioClientTransport({
		command: 'bun',
		args: [CLI, '__serve', '--workspace', root, '--name', name],
		cwd: root,
		env: { ...env, DELENDAI_AGENT_ID: 'e2e-model' },
		stderr: 'pipe',
	});
	let said = '';
	transport.stderr?.on('data', (chunk) => {
		said += String(chunk);
	});
	const client = new Client(
		{ name: 'first-boot-e2e', version: '0.0.0' },
		{ capabilities: {} },
	);
	await client.connect(transport);
	await client.listTools();
	await client.close();
	return said;
};

const read = (root: string, path: string): string =>
	readFileSync(join(root, path), 'utf8');

describe('e2e: delendai in a consumer project', () => {
	let root = '';
	beforeAll(() => {
		root = mkdtempSync(join(tmpdir(), 'consumer-'));
		execFileSync('git', ['init', '-q'], { cwd: root });
		writeFileSync(
			join(root, 'package.json'),
			JSON.stringify({ name: 'acme' }),
		);
		mkdirSync(join(root, '.vscode'));
		registerServer(root, 'Acme Tools');
	});
	afterAll(() => rmSync(root, { recursive: true, force: true }));

	it('a first start sets the project up, and its agents see the server under its upper-case name', async () => {
		const said = await start(root, 'Acme Tools');
		expect(said).toContain('first start in this project');
		expect(existsSync(join(root, 'delendai.config.json'))).toBe(true);
		expect(existsSync(join(root, 'docs/delendai/README.md'))).toBe(true);
		expect(read(root, '.github/agents/orchestrator.agent.md')).toContain(
			'acme-tools/*]',
		);
		expect(said).not.toContain('docsDir: "docs/delendai" does not exist');
	}, 120_000);

	it("the project's own plugin brings its agent role", async () => {
		mkdirSync(join(root, 'tools/plugins'), { recursive: true });
		writeFileSync(
			join(root, 'tools/plugins/acme-db.mjs'),
			`export default { name: 'acme-db', register: () => ({ agentRoles: [{ role: 'migration-runner', description: 'Runs migrations', instructions: 'Run the migrations.' }] }) };\n`,
		);
		const config = JSON.parse(read(root, 'delendai.config.json'));
		config.plugins = {
			...config.plugins,
			'acme-db': { path: './tools/plugins/acme-db.mjs' },
		};
		writeFileSync(
			join(root, 'delendai.config.json'),
			`${JSON.stringify(config, null, '\t')}\n`,
		);
		const said = await start(root, 'Acme Tools');
		expect(said).not.toContain('first start in this project');
		expect(
			read(root, '.github/agents/delendai-migration-runner.agent.md'),
		).toContain('acme-tools/*]');
	}, 120_000);

	it('a changed namespacePrefix brings the agents along', async () => {
		const config = JSON.parse(read(root, 'delendai.config.json'));
		config.namespacePrefix = 'acme';
		writeFileSync(
			join(root, 'delendai.config.json'),
			`${JSON.stringify(config, null, '\t')}\n`,
		);
		await start(root, 'Acme Tools');
		const orchestrator = read(root, '.github/agents/orchestrator.agent.md');
		expect(orchestrator).toContain('acme_overview');
		expect(orchestrator).not.toContain('delendai_overview');
	}, 120_000);

	it('a server renamed in the editor is what the agents grant at the next start', async () => {
		registerServer(root, 'Acme MCP');
		const said = await start(root, 'Acme MCP');
		expect(said).toContain('now grants acme-mcp/*');
		expect(read(root, '.github/agents/orchestrator.agent.md')).toContain(
			'acme-mcp/*]',
		);
		expect(
			read(root, '.github/agents/orchestrator.agent.md'),
		).not.toContain('acme-tools/*');
	}, 120_000);
});
