/**
 * agent-policy-instructions.helper.spec.ts — `core.agentPolicy` reaches
 * every agent: the server states it in the instructions a client receives
 * when it connects.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import {
	type DEVELOPMENT_PROFILES,
	expandProfile,
} from '@delendai/core/lib/development-policy/profiles';
import {
	agentOperatingLines,
	agentPolicyInstructions,
	agentPolicyLines,
} from '@delendai/core/lib/prompts/agent-policy-instructions.helper';
import { createMcpProject } from '@delendai/core/lib/project/create-mcp-project';
import { createWorkspacePathProvider } from '@delendai/core/lib/workspace/create-workspace-path-provider';

const policyFor = (profile: (typeof DEVELOPMENT_PROFILES)[number]) =>
	deriveCapabilities(expandProfile(profile));

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

	it('states no work model when no development policy resolved', () => {
		expect(agentPolicyInstructions({ autonomous: true })).not.toContain(
			'Work model:',
		);
	});

	it('states the work model the project resolved, not a universal one', () => {
		const merge = agentPolicyInstructions(
			{ autonomous: true },
			policyFor('shared-checkout-merge'),
		);
		const pr = agentPolicyInstructions(
			{ autonomous: true },
			policyFor('shared-checkout-pr'),
		);
		const direct = agentPolicyInstructions(
			{ autonomous: true },
			policyFor('shared-direct'),
		);

		// The incident: a project that merges was told, by a document, to
		// open pull requests. What the server says on connect is its own
		// profile's route, and only that.
		expect(merge).toContain('Work model: `shared-checkout-merge`');
		expect(merge).toContain('MERGING it into develop');
		expect(merge).toContain('opens no pull request');
		expect(merge).not.toContain('opens a pull request into');
		expect(merge).toContain('delendai work enter');

		expect(pr).toContain('Work model: `shared-checkout-pr`');
		expect(pr).toContain('opens a pull request into develop');
		expect(pr).not.toContain('MERGING it into');

		expect(direct).toContain('Commit your work directly to develop');
		expect(direct).not.toContain('delendai work enter');
		expect(direct).not.toContain('opens a pull request');
	});

	it('names the configured branch, never a convention', () => {
		const base = expandProfile('shared-checkout-merge');
		const text = agentPolicyInstructions(
			undefined,
			deriveCapabilities({
				...base,
				branches: { ...base.branches, integration: 'trunk' },
			}),
		);

		expect(text).toContain('MERGING it into trunk');
		expect(text).not.toContain('develop');
	});

	it('says to the bootstrap prompt what it says on connect', () => {
		const policy = policyFor('shared-checkout-merge');

		expect(
			agentOperatingLines({ autonomous: true }, policy).join('\n'),
		).toBe(agentPolicyInstructions({ autonomous: true }, policy));
	});

	it('reaches a client in the instructions it gets when it connects', async () => {
		const instructions = agentPolicyInstructions(
			{ autonomous: false },
			policyFor('shared-checkout-merge'),
		);
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
