/**
 * `<prefix>_framework_guidance` — what the installed framework version
 * says about one topic, as a small resolved answer.
 *
 * It reads the cache's summary only. The evidence behind each rule is
 * a separate call (`framework_source`), so the common path stays cheap.
 * When the version cannot be resolved it says so instead of guessing.
 */
import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolOk } from '@delendai/core/public';

import { RECOMMENDING_FORCES } from '../contracts/constants/knowledge-cache.constant';
import type {
	IKnowledgeSummaryEntry,
	IKnowledgeToolOptions,
} from '../contracts/interfaces/knowledge-cache.interface';
import { readSummary } from '../cache/knowledge-cache.service';
import { resolvePolicy } from '../policy/resolve-policy.helper';
import { resolveInstalledFramework } from '../resolve/installed-framework.helper';
import { GuidanceOutputSchema } from './knowledge-output.schema';

const TOPIC_PATTERN = /^[a-z][a-z0-9-]*$/u;
const MAX_TOPIC_LENGTH = 80;

const GuidanceInputSchema = z.object({
	topic: z.string().min(1).max(MAX_TOPIC_LENGTH).regex(TOPIC_PATTERN),
	framework: z.string().min(1).max(MAX_TOPIC_LENGTH).optional(),
});

type IGuidanceArgs = z.infer<typeof GuidanceInputSchema>;

/** The rule to follow when nothing the project said outranks the framework. */
const pickRecommendation = (
	entries: readonly IKnowledgeSummaryEntry[],
): string | undefined => {
	for (const force of RECOMMENDING_FORCES) {
		const found = entries.find((entry) => entry.force === force);
		if (found !== undefined) return found.id;
	}
	return undefined;
};

const resolveEntries = (entries: readonly IKnowledgeSummaryEntry[]) => {
	const recommendation = pickRecommendation(entries);
	const fallback =
		recommendation ??
		entries.find((entry) => entry.force !== 'removed')?.id;
	// Every rule removed: there is nothing to follow, and saying so by
	// omitting a resolution is clearer than inventing a default.
	if (fallback === undefined) return undefined;
	return resolvePolicy({
		options: entries.map((entry) => ({
			value: entry.id,
			force: entry.force,
		})),
		frameworkRecommendation: recommendation,
		defaultValue: fallback,
	});
};

export const runFrameworkGuidance = async (
	args: IGuidanceArgs,
	options: IKnowledgeToolOptions,
) => {
	const installed = await resolveInstalledFramework(
		options.workspaceRootAbs,
		args.framework,
	);
	if (installed === undefined) {
		return toolOk({
			status: 'unresolved',
			topic: args.topic,
			note: 'No known framework dependency was found in package.json.',
		});
	}
	if (installed.version === undefined || installed.lockEntry === undefined) {
		return toolOk({
			status: 'unresolved',
			framework: installed.frameworkId,
			topic: args.topic,
			note: 'The installed version is not resolved: no lockfile entry and no exact pin. Install dependencies, then ask again.',
		});
	}
	const summary = await readSummary(
		options.cacheRootAbs,
		{ frameworkId: installed.frameworkId, version: installed.version },
		installed.lockEntry,
		args.topic,
	);
	if (!summary.hit || summary.entries.length === 0) {
		return toolOk({
			status: 'no-knowledge',
			framework: installed.frameworkId,
			version: installed.version,
			topic: args.topic,
			note: summary.hit
				? 'The cache holds nothing for this topic at this version.'
				: `No usable knowledge is cached for this version (${summary.reason}).`,
		});
	}
	const resolution = resolveEntries(summary.entries);
	return toolOk({
		status: 'resolved',
		framework: installed.frameworkId,
		version: installed.version,
		topic: args.topic,
		rules: summary.entries.map(({ id, statement, force }) => ({
			id,
			statement,
			force,
		})),
		...(resolution === undefined
			? {}
			: {
					resolution: {
						outcome: resolution.outcome,
						ruleId: resolution.value,
						source: resolution.source,
						...(resolution.outcome === 'incompatible'
							? { reason: resolution.reason }
							: {}),
					},
				}),
	});
};

export const buildGuidanceRegistration = (
	options: IKnowledgeToolOptions,
): IToolRegistration => ({
	id: 'framework_guidance',
	tags: ['knowledge', 'frameworks', 'compact'],
	summary:
		'What the installed framework version allows, recommends and forbids for one topic, as a small resolved answer.',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_framework_guidance`,
			{
				description:
					'Resolve one topic against the INSTALLED framework version. Pass `topic` (lower-kebab, e.g. `component-styles`) and optionally `framework` to pick one in a mixed repo. Returns the rules with their force, the rule to follow, and `unresolved` when the version cannot be read from the lockfile. Evidence is not included: ask `framework_source` with a rule id.',
				inputSchema: GuidanceInputSchema,
				outputSchema: GuidanceOutputSchema,
			},
			async (args: IGuidanceArgs) => {
				try {
					return await runFrameworkGuidance(args, options);
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
