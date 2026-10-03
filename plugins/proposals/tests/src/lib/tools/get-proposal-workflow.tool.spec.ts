import { describe, expect, it } from 'vitest';

import { buildGetProposalWorkflowRegistration } from '@delendai/proposals/lib/tools/get-proposal-workflow.tool';
import { buildProposalTemplatesResourceRegistration } from '@delendai/proposals/lib/resources/proposal-templates.resource';

describe('get_proposal_workflow registration metadata', () => {
	it('publishes compact descriptions without dropping schemas', async () => {
		let definition: Record<string, unknown> | undefined;
		let handler: (args: unknown) => Promise<unknown>;
		const registration = buildGetProposalWorkflowRegistration({
			namespacePrefix: 'proposals',
			proposalsDir: '/workspace/docs/proposals',
			indexFile: '/workspace/.cache/proposals/index.json',
		});

		await registration.register({
			registerTool: (
				_name: string,
				registeredDefinition: unknown,
				registeredHandler: typeof handler,
			) => {
				definition = registeredDefinition as Record<string, unknown>;
				handler = registeredHandler;
			},
		} as never);

		expect(registration.summary).toBe(
			'Read proposal workflow conventions and template.',
		);
		expect(definition?.description).toBe(
			'Read proposal workflow conventions, rules, and template.',
		);
		expect(definition?.inputSchema).toBeDefined();
		expect(definition?.outputSchema).toBeDefined();
	});
});

describe('proposal templates resource registration', () => {
	it('registers a readable compact workflow resource', async () => {
		let resourceHandler:
			| (() => Promise<{
					contents: Array<{
						text?: string;
						uri: string;
						mimeType?: string;
					}>;
			  }>)
			| undefined;
		const registration = buildProposalTemplatesResourceRegistration({
			proposalsDir: '/workspace/docs/proposals',
			indexFile: '/workspace/.cache/proposals/index.json',
		});

		await registration.register({
			registerResource: (
				_name: string,
				_uri: string,
				_metadata: unknown,
				handler: typeof resourceHandler,
			) => {
				resourceHandler = handler;
			},
		} as never);

		expect(resourceHandler).toBeDefined();
		const result = await resourceHandler!();
		const text = result.contents[0]?.text ?? '{}';
		const body = JSON.parse(text) as {
			naming?: string;
			template?: string;
		};

		expect(result.contents[0]?.uri).toBe('delendai://proposals/templates');
		expect(result.contents[0]?.mimeType).toBe('application/json');
		expect(body.naming).toBeTypeOf('string');
		expect(body.template).toBeTypeOf('string');
	});
});
