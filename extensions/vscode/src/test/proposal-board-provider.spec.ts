import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@mcp-vertex/client';

import { ProposalBoardProvider } from '../providers/proposal-board-provider';

describe('ProposalBoardProvider', async () => {
	it('sorts proposals by operational status', async () => {
		const provider = new ProposalBoardProvider(
			McpStdioClient.fromTransport({
				async callTool(input) {
					expect(input).toEqual({
						name: 'mcp-vertex_proposals_proposal_board',
						arguments: {},
					});
					return {
						structuredContent: {
							proposals: [
								{ id: 'f3', status: 'done', slices: [] },
								{ id: 'f1', status: 'ready', slices: [] },
								{
									id: 'f2',
									status: 'in-progress',
									slices: [
										{
											sliceId: 'S1',
											status: 'done',
											owner: null,
										},
									],
									claimableSliceIds: ['S2'],
								},
							],
						},
					};
				},
			}),
		);

		const nodes = await provider.getChildren();

		expect(nodes.map((node) => node.label)).toEqual(['f2', 'f1', 'f3']);
		expect(nodes[0]).toMatchObject({
			description: 'in-progress • 1 slices',
			tooltip: '1 claimable slices',
			command: {
				command: 'mcp-vertex.openProposal',
				arguments: ['f2'],
			},
		});
	});
});
