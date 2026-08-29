import { describe, expect, it } from 'vitest';

import { buildGetProposalWorkflowRegistration } from '@mcp-vertex/proposals/lib/tools/get-proposal-workflow.tool';

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
