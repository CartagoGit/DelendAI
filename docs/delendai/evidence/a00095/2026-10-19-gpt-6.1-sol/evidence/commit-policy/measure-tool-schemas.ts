import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import plugin from '../../../../../../../plugins/commit-policy/src/index';

const workspace = mkdtempSync(join(tmpdir(), 'commit-policy-schema-'));
execFileSync('git', ['init', '-q'], { cwd: workspace });
const runtime = await plugin.register({
	workspace: {
		root: workspace,
		resolve: (path: string) => join(workspace, path),
	},
	corePaths: { cacheDir: '.cache/delendai', docsDir: 'docs/delendai' },
	cacheDir: '.cache/delendai',
	docsDir: 'docs/delendai',
	keepLegacy: false,
	pluginCacheDir: '.cache/delendai/commit-policy',
	pluginDocsDir: 'docs/delendai/commit-policy',
	namespacePrefix: 'delendai_commit-policy',
	options: {},
	pluginOptions: new Map(),
	args: {},
} as never);
const registrations = runtime.registrations?.tools ?? [];
const server = new McpServer({ name: 'commit-policy-audit', version: '1' });
for (const registration of registrations) await registration.register(server);
const client = new Client({ name: 'commit-policy-audit', version: '1' });
const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);
try {
	const listed = await client.listTools();
	const bytes = (value: unknown): number =>
		Buffer.byteLength(JSON.stringify(value));
	console.log(
		JSON.stringify(
			{
				toolCount: listed.tools.length,
				definitionBytes: listed.tools.reduce(
					(total, tool) => total + bytes(tool),
					0,
				),
				inputSchemaBytes: listed.tools.reduce(
					(total, tool) => total + bytes(tool.inputSchema),
					0,
				),
				outputSchemaBytes: listed.tools.reduce(
					(total, tool) =>
						total +
						(tool.outputSchema ? bytes(tool.outputSchema) : 0),
					0,
				),
				listEnvelopeBytes: bytes(listed),
				names: listed.tools.map((tool) => tool.name),
			},
			null,
			2,
		),
	);
} finally {
	await client.close();
	await server.close();
	await runtime.dispose?.();
}
