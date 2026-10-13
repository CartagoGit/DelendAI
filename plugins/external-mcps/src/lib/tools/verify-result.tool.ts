/**
 * verify-result.tool.ts — `<prefix>_verify_result`: the files an agent
 * produced from an external answer, checked against the project's
 * contract.
 */
import { toolJson } from '@delendai/core/public';
import type { IToolRegistration } from '@delendai/core/contracts';
import z from 'zod';

import type { ICapabilityGateway } from '../contracts/interfaces/project-contract.interface';
import { verifyAgainstContract } from '../verify/verify-against-contract.service';

const InputSchema = z.object({
	/** The files produced, with their content. */
	files: z
		.array(z.object({ path: z.string().min(1), content: z.string() }))
		.min(1),
	/** What the external source targeted, when it said. */
	source: z
		.object({
			framework: z
				.object({ id: z.string(), version: z.string() })
				.optional(),
		})
		.optional(),
});

export const VerifyResultOutputSchema = z.object({
	ok: z.literal(true),
	/** The plugins whose part of the contract was checked. */
	checked: z.array(z.string()),
	findings: z.array(
		z.object({
			kind: z.enum(['placement', 'design-token', 'framework-version']),
			path: z.string().optional(),
			detail: z.string(),
			resolvedTo: z.literal('project'),
			overridden: z.string().optional(),
		}),
	),
});

export const buildVerifyResultToolRegistration = (options: {
	readonly namespacePrefix: string;
	readonly gateway: ICapabilityGateway;
}): IToolRegistration => ({
	id: 'verify_result',
	tags: ['external-mcps', 'lazy'],
	descriptionKey: 'delendai_external-mcps_verify_result',
	summary:
		'Check files produced from an external answer against the project contract; conflicts resolve to the project.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_verify_result`,
			{
				description:
					'Check the files produced from an external answer (a design, a page) against the project contract the call carried: placement by the conventions, design tokens instead of literal colours, the installed framework version. Read-only. A conflict between the source and the project is resolved to the project, naming what it overrode.',
				inputSchema: InputSchema,
				outputSchema: VerifyResultOutputSchema,
			},
			async (args: z.infer<typeof InputSchema>) => {
				const contract = await options.gateway.contract();
				const findings = verifyAgainstContract({
					files: args.files,
					contract,
					...(options.gateway.roleOf === undefined
						? {}
						: { roleOf: options.gateway.roleOf }),
					...(args.source?.framework === undefined
						? {}
						: { source: { framework: args.source.framework } }),
				});
				return toolJson({
					ok: true,
					checked: [...contract.from],
					findings: [...findings],
				});
			},
		);
	},
});
