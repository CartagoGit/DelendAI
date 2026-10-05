/**
 * `<prefix>_framework_source` — the evidence behind one rule, only when
 * asked. It opens the cache's evidence file, which the guidance path
 * never reads.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/public';
import { toolError, toolOk } from '@delendai/core/public';

import type { IKnowledgeToolOptions } from '../contracts/interfaces/knowledge-cache.interface';
import { readEvidence } from '../cache/knowledge-cache.service';
import { resolveInstalledFramework } from '../resolve/installed-framework.helper';
import { SourceOutputSchema } from './knowledge-output.schema';

const RULE_ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const MAX_ID_LENGTH = 80;

const SourceInputSchema = z.object({
	ruleId: z.string().min(1).max(MAX_ID_LENGTH).regex(RULE_ID_PATTERN),
	framework: z.string().min(1).max(MAX_ID_LENGTH).optional(),
});

type ISourceArgs = z.infer<typeof SourceInputSchema>;

export const runFrameworkSource = async (
	args: ISourceArgs,
	options: IKnowledgeToolOptions,
) => {
	const installed = await resolveInstalledFramework(
		options.workspaceRootAbs,
		args.framework,
	);
	if (
		installed === undefined ||
		installed.version === undefined ||
		installed.lockEntry === undefined
	) {
		return toolError(
			'The installed framework version is not resolved.',
			'Install dependencies so the lockfile names the version, then ask again.',
			'unresolved',
		);
	}
	const found = await readEvidence(
		options.cacheRootAbs,
		{ frameworkId: installed.frameworkId, version: installed.version },
		installed.lockEntry,
		args.ruleId,
	);
	if (!found.hit) {
		return toolError(
			`No evidence cached for rule ${args.ruleId} at ${installed.frameworkId} ${installed.version} (${found.reason}).`,
			'Ask framework_guidance for the topic to list the rule ids that exist.',
			found.reason,
		);
	}
	return toolOk({
		framework: installed.frameworkId,
		version: installed.version,
		ruleId: found.ruleId,
		statement: found.statement,
		evidence: found.evidence,
	});
};

export const buildSourceRegistration = (
	options: IKnowledgeToolOptions,
): IToolRegistration => ({
	id: 'framework_source',
	tags: ['knowledge', 'frameworks', 'compact'],
	summary:
		'The evidence (source and retrieval time) behind one framework rule, only when asked.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_framework_source`,
			{
				description:
					'Return where one framework rule came from and when it was read. Pass `ruleId` from a `framework_guidance` answer. Read-only; answers from the local cache, never the network.',
				inputSchema: SourceInputSchema,
				outputSchema: SourceOutputSchema,
			},
			async (args: ISourceArgs) => {
				try {
					return await runFrameworkSource(args, options);
				} catch (error) {
					return toolError(
						error instanceof Error ? error.message : String(error),
						'Check that the workspace is readable.',
					);
				}
			},
		);
	},
});
