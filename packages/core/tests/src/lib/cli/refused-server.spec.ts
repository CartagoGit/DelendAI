import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { REFUSED_SERVER_TOOL } from '@delendai/core/lib/cli/refused-server.constant';
import { createRefusedServer } from '@delendai/core/lib/cli/refused-server';

const REFUSAL =
	'[enforced-governance-needs-checks] integration.requiredChecks: name the check the forge must require.';

const connected = async () => {
	const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
	await createRefusedServer(REFUSAL).connect(serverSide);
	const client = new Client({ name: 'host', version: '1.0.0' });
	await client.connect(clientSide);
	return client;
};

describe('a server that refused to start', () => {
	it('tells the host why in its instructions instead of closing the connection', async () => {
		const client = await connected();
		const instructions = client.getInstructions() ?? '';
		expect(instructions).toContain('cannot start in this workspace');
		expect(instructions).toContain('enforced-governance-needs-checks');
		await client.close();
	});

	it('offers exactly one tool, which returns the same refusal', async () => {
		const client = await connected();
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).toEqual([REFUSED_SERVER_TOOL]);
		const result = await client.callTool({
			name: REFUSED_SERVER_TOOL,
			arguments: {},
		});
		expect(result.structuredContent).toEqual({
			started: false,
			refusal: REFUSAL,
		});
		await client.close();
	});
});
