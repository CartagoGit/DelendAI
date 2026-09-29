import type { IResourceRegistration } from '@delendai/core/public';

import type { IWorkIsolation } from '@delendai/core/plugin';

import { buildProposalWorkflow } from '../knowledge/proposal-workflow';

export interface IProposalTemplatesResourceOptions {
	readonly proposalsDir: string;
	readonly indexFile: string;
	/** How the development policy isolates agents; drives the workflow rule. */
	readonly isolation?: IWorkIsolation | undefined;
	readonly uri?: string;
}

/** Exposes proposal templates through native MCP resources. */
export const buildProposalTemplatesResourceRegistration = (
	options: IProposalTemplatesResourceOptions,
): IResourceRegistration => {
	const uri = options.uri ?? 'delendai://proposals/templates';

	return {
		id: 'resource:proposal-templates',
		register: async (server) => {
			server.registerResource(
				'proposal-templates',
				uri,
				{
					title: 'Proposal templates',
					description: 'Proposal templates and workflow conventions.',
					mimeType: 'application/json',
				},
				async () => {
					const workflow = buildProposalWorkflow(
						options.proposalsDir,
						options.indexFile,
						...(options.isolation !== undefined
							? [options.isolation]
							: []),
					);
					return {
						contents: [
							{
								uri,
								mimeType: 'application/json',
								text: JSON.stringify({
									naming: workflow.naming,
									template: workflow.template,
								}),
							},
						],
					};
				},
			);
		},
	};
};
