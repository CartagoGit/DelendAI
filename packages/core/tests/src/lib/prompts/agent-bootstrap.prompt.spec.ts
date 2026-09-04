import { describe, expect, it } from 'vitest';

import { buildAgentBootstrapPromptRegistration } from '@delendai/core/lib/prompts/agent-bootstrap.prompt';

const fakeServer = () => {
	let handler:
		| (() => Promise<{ messages: Array<{ content: { text: string } }> }>)
		| undefined;
	return {
		server: {
			registerPrompt: (
				_name: string,
				_definition: unknown,
				value: unknown,
			) => {
				handler = value as typeof handler;
			},
		},
		invoke: async () => {
			if (handler === undefined)
				throw new Error('prompt was not registered');
			return handler();
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
		const registration = buildAgentBootstrapPromptRegistration(
			'mcp-vertex',
			{
				sources: emptySources,
				server: {
					name: 'test',
					version: '1.0.0',
					namespacePrefix: 'mcp-vertex',
				},
				agentPolicy: {
					autonomous: false,
					principles: ['Prefer existing abstractions.'],
				},
			},
		);
		const fake = fakeServer();
		await registration.register(fake.server as never);
		const result = await fake.invoke();
		const text = result.messages[0]?.content.text ?? '';
		expect(text).toContain(
			'collaborative / ask before autonomous execution',
		);
		expect(text).toContain('- Prefer existing abstractions.');
	});

	it('uses the autonomous engineering defaults when omitted', async () => {
		const registration = buildAgentBootstrapPromptRegistration(
			'mcp-vertex',
			{
				sources: emptySources,
				server: {
					name: 'test',
					version: '1.0.0',
					namespacePrefix: 'mcp-vertex',
				},
			},
		);
		const fake = fakeServer();
		await registration.register(fake.server as never);
		const text = (await fake.invoke()).messages[0]?.content.text ?? '';
		expect(text).toContain('autonomous by default');
		expect(text).toContain('Apply SOLID architecture');
	});
});
