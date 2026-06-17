import { z } from 'zod';

import type { IFileReader, IToolRegistration } from '@cartago-git/mcp-core/public';
import { toolError, toolJson } from '@cartago-git/mcp-core/public';

import { cancelActiveRuns, runScope } from './runner';
import type { ICommandRunner } from './runner';
import type { ICommandPolicy } from './command-policy';
import { resolveScopes } from './scopes';
import type { IScopeMap } from './scopes';

export interface IQualityToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly workspaceRoot: string;
	readonly run: ICommandRunner;
	readonly optionScopes?: Readonly<Record<string, readonly string[]>>;
	/** Optional allow/deny policy enforced before any command is spawned. */
	readonly commandPolicy?: ICommandPolicy;
}

const scopesOf = (options: IQualityToolOptions): IScopeMap =>
	resolveScopes(
		options.reader,
		options.optionScopes ? { scopes: options.optionScopes } : {}
	);

/**
 * Quality-gate tools: list the configured scopes and run them, returning
 * a structured pass/fail report. Commands come from plugin options, the
 * config's validationMatrix, or the project's package.json scripts.
 */
export const buildQualityToolRegistrations = (
	options: IQualityToolOptions
): readonly IToolRegistration[] => {
	const prefix = options.namespacePrefix;
	return [
		{
			id: 'get_quality_scopes',
			summary: 'List the available quality scopes and their commands.',
			tags: ['quality', 'orientation'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_get_quality_scopes`,
					{
						description:
							'List the quality-gate scopes and the commands each runs. Read-only.',
						outputSchema: z.object({ scopes: z.record(z.string(), z.array(z.object({ command: z.string(), expect: z.string().optional() }))) }),
					},
					async () => toolJson({ scopes: scopesOf(options) })
				);
			},
		},
		{
			id: 'run_quality',
			summary:
				'Run a quality scope (lint/test/build/typecheck) and return structured pass/fail.',
			tags: ['quality'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_run_quality`,
					{
						description:
							'Execute a quality scope’s commands and return a structured pass/fail report (per command: ok, exit code, output tail). Without `scope`, runs the first/`all` scope. This DOES execute the project’s commands.',
						inputSchema: z.object({ scope: z.string().optional() }),
						outputSchema: z.object({ scope: z.string(), ok: z.boolean(), results: z.array(z.object({ command: z.string(), ok: z.boolean(), code: z.number(), timedOut: z.boolean(), tail: z.string() })) }),
					},
					async (args: { scope?: string | undefined }) => {
						const scopes = scopesOf(options);
						const names = Object.keys(scopes);
						if (names.length === 0) {
							return toolError(
								'no quality scopes configured',
								'Add scripts to package.json, a validationMatrix to mcp-core.config.json, or `scopes` to the plugin options.'
							);
						}
						const scope =
							args.scope ??
							(names.includes('all') ? 'all' : (names[0] as string));
						const commands = scopes[scope];
						if (commands === undefined) {
							return toolError(
								`unknown scope "${scope}"`,
								`Available: ${names.join(', ')}.`
							);
						}
						return toolJson(
							await runScope(
								scope,
								commands,
								options.workspaceRoot,
								options.run,
								options.commandPolicy
							)
						);
					}
				);
			},
		},
		{
			id: 'quality_cancel',
			summary:
				'Abort running quality commands (by PID or all) instead of waiting for the timeout.',
			tags: ['quality'],
			register: async (server) => {
				server.registerTool(
					`${prefix}_quality_cancel`,
					{
						description:
							'Abort quality commands currently running in this server. With `pid`, cancels only that one; otherwise cancels every in-flight run (SIGKILL on the whole process group). Returns the cancelled PIDs. Use when a run_quality scope is taking too long.',
						inputSchema: z.object({ pid: z.number().optional() }),
						outputSchema: z.object({
							cancelled: z.array(z.number()),
							count: z.number(),
						}),
					},
					async (args: { pid?: number | undefined }) => {
						const cancelled = cancelActiveRuns(args.pid);
						return toolJson({ cancelled, count: cancelled.length });
					}
				);
			},
		},
	];
};
