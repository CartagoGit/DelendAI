/**
 * agent-policy-instructions.helper.spec.ts — `core.agentPolicy` reaches
 * every agent: the server states it in the instructions a client receives
 * when it connects.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import {
	agentPolicyInstructions,
	agentPolicyLines,
} from '@delendai/core/lib/prompts/agent-policy-instructions.helper';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';

describe('the agent policy', () => {
	it('asks the user unless the project opts in to autonomy', () => {
		expect(agentPolicyLines(undefined)[0]).toContain(
			'Working mode: collaborative.',
		);
		expect(agentPolicyLines({ autonomous: true })[0]).toContain(
			'Working mode: autonomous.',
		);
	});

	it('lists the project’s principles, or the defaults', () => {
		expect(agentPolicyLines({ principles: ['Keep it small.'] })).toContain(
			'- Keep it small.',
		);
		expect(agentPolicyLines(undefined).join('\n')).toContain(
			'Apply SOLID architecture',
		);
	});

	it('reaches a client in the instructions it gets when it connects', async () => {
		const instructions = agentPolicyInstructions({ autonomous: false });
		const project = await createMcpProject({
			metadata: {
				name: 'policy-spec',
				version: '0.0.0',
				description: 'spec',
			},
			namespacePrefix: 'spec',
			workspace: createWorkspacePathProvider('/tmp/spec-agent-policy'),
			validationMatrix: { scopes: {} },
			instructions,
		});
		const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
		await project.server.connect(serverSide);
		const client = new Client({ name: 'policy-client', version: '0' });
		await client.connect(clientSide);
		try {
			expect(client.getInstructions()).toBe(instructions);
		} finally {
			await client.close();
			await project.server.close();
		}
	});
});
