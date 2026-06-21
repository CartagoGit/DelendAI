import { z } from 'zod';
import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildProposalWorkflow } from '../knowledge/proposal-workflow';

export interface IGetProposalWorkflowToolOptions {
	readonly namespacePrefix: string;
	readonly proposalsDir: string;
	readonly indexFile: string;
}

/**
 * Returns the proposal workflow (families, locations, naming, rules,
 * template) as structured JSON. Read-only; an agent calls it once to
 * learn how this project's proposals work.
 */
export const buildGetProposalWorkflowRegistration = (
	options: IGetProposalWorkflowToolOptions,
): IToolRegistration => ({
	id: 'get_proposal_workflow',
	summary:
		'Returns families, locations, naming, rules and the proposal template (as JSON).',
	tags: ['orientation', 'lazy'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_get_proposal_workflow`,
			{
				outputSchema: z.object({
					families: z.array(
						z.object({
							prefix: z.string(),
							/** f127: proposal kind this family maps to (e.g. "fix", "feat"). */
							kind: z.string().optional(),
							description: z.string(),
							cascadePriority: z.number(),
						}),
					),
					locations: z.record(z.string(), z.string()),
					naming: z.string(),
					rules: z.array(z.string()),
					template: z.string(),
				}),
				description:
					'Returns the proposal workflow as structured JSON: families (prefix, kind, description and cascade priority — 12 active kinds + the legacy `p` alias), file locations, naming, rules and the canonical markdown template. Read-only.',
			},
			async () => {
				const workflow = buildProposalWorkflow(
					options.proposalsDir,
					options.indexFile,
				);
				return {
					content: [
						{
							type: 'text' as const,
							text: JSON.stringify(workflow),
						},
					],
					structuredContent: workflow as unknown as Record<
						string,
						unknown
					>,
				};
			},
		);
	},
});
