import { z } from 'zod';
import type { IValidationMatrix } from '../contracts/interfaces/validation-matrix.interface';
import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import { toolJson } from '../shared/tool-response';

/**
 * Returns the project's quality-gate commands per scope so an agent
 * knows exactly how to validate its work here — without guessing
 * `bun run ...` / `npm test`. Sourced from `mcp-vertex.config.json`
 * (`validationMatrix`). Empty `scopes` means none configured.
 */
export const buildValidationMatrixToolRegistration = (
	namespacePrefix: string,
	matrix: () => IValidationMatrix,
): IToolRegistration => ({
	id: 'get_validation_matrix',
	summary:
		'Returns the quality-gate commands per scope (how to validate work in this project).',
	tags: ['orientation'],
	register: async (server) => {
		server.registerTool(
			`${namespacePrefix}_get_validation_matrix`,
			{
				description:
					'Returns the quality-gate commands grouped by scope (e.g. full/tools), each with its expected outcome. Run these to validate your work. Read-only.',
				outputSchema: z.object({
					scopes: z.record(
						z.string(),
						z.array(
							z.object({
								command: z.string(),
								expect: z.string(),
							}),
						),
					),
				}),
			},
			async () => toolJson(matrix()),
		);
	},
});
