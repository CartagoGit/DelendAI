import type {
	McpServer,
	RegisteredPrompt,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { deriveCapabilities } from '@delendai/core/lib/development-policy/derive';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import { buildAgentBootstrapPromptRegistration } from '@delendai/core/lib/prompts/agent-bootstrap.prompt';
import { agentPolicyInstructions } from '@delendai/core/lib/prompts/agent-policy-instructions.helper';

interface IPromptResult {
	readonly messages: ReadonlyArray<{
		readonly content: { readonly text: string };
	}>;
}

const fakeServer = () => {
	let handler: ((...args: never[]) => unknown) | undefined;
	return {
		server: fakePartial<McpServer>({
			registerPrompt: (_name, _definition, callback) => {
				handler = callback;
				return fakePartial<RegisteredPrompt>({});
			},
		}),
		invoke: async (): Promise<IPromptResult> => {
			if (handler === undefined)
				throw new Error('prompt was not registered');
			return (await handler()) as IPromptResult;
		},
	};
};

const emptySources = {
	tools: () => [],
	skills: () => [],
	proposals: () => [],
};

describe('agent bootstrap prompt', () => {
	it('renders configured autonomy and engineering principles', async () => {
		const registration = buildAgentBootstrapPromptRegistration('delendai', {
			sources: emptySources,
			server: {
				name: 'test',
				version: '1.0.0',
				namespacePrefix: 'delendai',
			},
			agentPolicy: {
				autonomous: true,
				principles: ['Prefer existing abstractions.'],
			},
		});
		const fake = fakeServer();
		await registration.register(fake.server);
		const result = await fake.invoke();
		const text = result.messages[0]?.content.text ?? '';
		expect(text).toContain('Working mode: autonomous.');
		expect(text).toContain('- Prefer existing abstractions.');
	});

	it('asks the user by default when the project states no policy', async () => {
		const registration = buildAgentBootstrapPromptRegistration('delendai', {
			sources: emptySources,
			server: {
				name: 'test',
				version: '1.0.0',
				namespacePrefix: 'delendai',
			},
		});
		const fake = fakeServer();
		await registration.register(fake.server);
		const text = (await fake.invoke()).messages[0]?.content.text ?? '';
		expect(text).toContain('Working mode: collaborative.');
		expect(text).toContain('never answer a question in their place');
		expect(text).toContain('Apply SOLID architecture');
	});

	it('states the resolved work model in the words the server uses on connect', async () => {
		const developmentPolicy = deriveCapabilities(
			expandProfile('shared-checkout-merge'),
		);
		const registration = buildAgentBootstrapPromptRegistration('delendai', {
			sources: emptySources,
			server: {
				name: 'test',
				version: '1.0.0',
				namespacePrefix: 'delendai',
			},
			agentPolicy: { autonomous: true },
			developmentPolicy,
		});
		const fake = fakeServer();
		await registration.register(fake.server);
		const text = (await fake.invoke()).messages[0]?.content.text ?? '';
		expect(text).toContain(
			agentPolicyInstructions({ autonomous: true }, developmentPolicy),
		);
		expect(text).toContain('opens no pull request');
	});

	it('names the proposals an agent can act on now', async () => {
		const registration = buildAgentBootstrapPromptRegistration('delendai', {
			sources: {
				...emptySources,
				proposals: () => [
					{
						id: 'f00001',
						title: 'Ready work',
						track: 'hosts',
						status: 'ready',
						kind: 'feat',
					},
				],
			},
			server: {
				name: 'test',
				version: '1.0.0',
				namespacePrefix: 'delendai',
			},
			now: () => new Date('2026-09-29T00:00:00Z'),
		});
		const fake = fakeServer();
		await registration.register(fake.server);
		const text = (await fake.invoke()).messages[0]?.content.text ?? '';
		expect(text).toContain('Actionable proposals: f00001');
	});
});
