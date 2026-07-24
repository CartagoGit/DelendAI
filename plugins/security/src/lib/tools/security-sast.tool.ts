import { z } from 'zod';

import type { IToolRegistration } from '@mcp-vertex/core/public';
import {
	summarizeFindings,
	toolError,
	toolJson,
	worstSeverity,
} from '@mcp-vertex/core/public';

import {
	detectStack,
	MissingCliError,
	runSastRunner,
	SAST_RULES,
	type IRunSastRunnerInput,
	type ISecuritySastToolOptions,
} from '../sast/exports';

const FINDING = z.object({
	ruleId: z.string(),
	severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
	message: z.string(),
	fix: z.string().optional(),
	location: z
		.object({
			file: z.string(),
			line: z.number().optional(),
			endLine: z.number().optional(),
		})
		.optional(),
});

export const buildSecuritySastRegistration = (
	options: ISecuritySastToolOptions,
): IToolRegistration => ({
	id: 'security_sast',
	summary:
		'Scan source for SAST findings via semgrep or ast-grep rule packs, with a bounded regex fallback.',
	tags: ['security', 'sast'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_security_sast`,
			{
				description:
					'Scan the project for SAST findings using stack-aware rule packs. `runner:auto` prefers semgrep, then ast-grep, then a bounded inline regex fallback when neither CLI is installed. `rules` filters the built-in data-only rule pack by id.',
				inputSchema: z
					.object({
						cwd: z.string().optional(),
						runner: z
							.enum(['semgrep', 'ast-grep', 'auto'])
							.optional(),
						rules: z.array(z.string()).optional(),
					})
					.strict(),
				outputSchema: z.object({
					tool: z.literal('sast'),
					scanned: z.number(),
					findings: z.array(FINDING),
					summary: z.object({
						critical: z.number(),
						high: z.number(),
						medium: z.number(),
						low: z.number(),
						info: z.number(),
					}),
					worst: z.string(),
				}),
			},
			async (args: {
				cwd?: string | undefined;
				runner?: 'semgrep' | 'ast-grep' | 'auto' | undefined;
				rules?: string[] | undefined;
			}) => {
				const cwd = args.cwd ?? options.workspaceRootAbs;
				const stack = await (options.detectStack ?? detectStack)(cwd);
				const selectedRules = (options.rules ?? SAST_RULES).filter(
					(rule) =>
						(args.rules?.includes(rule.id) ?? true) &&
						(stack.languages.includes(rule.language) ||
							rule.language === 'generic'),
				);
				try {
					const result = await (
						options.runSastRunner ?? runSastRunner
					)({
						cwd,
						runner: args.runner ?? 'auto',
						rules: selectedRules,
						languages: stack.languages,
						files: stack.files,
					});
					return toolJson({
						tool: 'sast',
						scanned: result.scanned,
						findings: result.findings,
						summary: summarizeFindings(result.findings),
						worst: worstSeverity(result.findings) ?? 'none',
					});
				} catch (error) {
					if (error instanceof MissingCliError) {
						return toolError(error.message, error.hint);
					}
					return toolError(
						(error as Error).message,
						'Retry with runner:auto or install semgrep/ast-grep.',
					);
				}
			},
		);
	},
});
