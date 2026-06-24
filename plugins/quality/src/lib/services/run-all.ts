import { z } from 'zod';

import type { IFileReader, IToolRegistration } from '@mcp-vertex/core/public';
import { toolError, toolJson } from '@mcp-vertex/core/public';

import type { ICommandPolicy } from './command-policy';
import type { ICommandRunner, IScopeCommand } from './runner';
import { runScope } from './runner';
import { resolveScopes } from './scopes';
import type { IScopeMap } from './scopes';

/**
 * Aggregator over every configured scope — formalizes what an ad-hoc
 * scope literally named `all` (from `fromScripts`/the config matrix) used
 * to mean. `quality_run_all` iterates `get_quality_scopes`' own scope map
 * and runs each one through the existing `runScope`, never re-implementing
 * per-command execution: this module only iterates + aggregates.
 */
export interface IQualityAllResult {
	readonly scope: string;
	readonly ok: boolean;
	/** Wall-clock duration of this scope's commands, in ms. */
	readonly duration: number;
	readonly errors: readonly string[];
}

export interface IQualityRunAllReport {
	readonly results: readonly IQualityAllResult[];
	readonly summary: { readonly ok: boolean; readonly scopes: number };
}

/**
 * Run every scope in `scopes`, in stable key order, aggregating each into
 * `{scope, ok, duration, errors[]}`. A scope's `errors` lists the `tail` of
 * every failing command (empty when the scope passed). `summary.ok` is
 * `true` only when every scope passed. Scopes run sequentially — quality
 * gates are typically CPU/IO heavy and a host running them concurrently
 * would defeat any `commandPolicy`/timeout budgeting per scope.
 */
export const runAllScopes = async (
	scopes: IScopeMap,
	cwd: string,
	run: ICommandRunner,
	policy?: ICommandPolicy,
): Promise<IQualityRunAllReport> => {
	const results: IQualityAllResult[] = [];
	for (const [scope, commands] of Object.entries(scopes)) {
		const startedAt = Date.now();
		const outcome = await runScope(
			scope,
			commands as readonly IScopeCommand[],
			cwd,
			run,
			policy,
		);
		results.push({
			scope,
			ok: outcome.ok,
			duration: Date.now() - startedAt,
			errors: outcome.results
				.filter((r) => !r.ok)
				.map((r) => `${r.command}: ${r.tail}`),
		});
	}
	return {
		results,
		summary: {
			ok: results.every((r) => r.ok),
			scopes: results.length,
		},
	};
};

export interface IRunAllToolOptions {
	readonly namespacePrefix: string;
	readonly reader: IFileReader;
	readonly workspaceRoot: string;
	readonly run: ICommandRunner;
	readonly optionScopes?: Readonly<Record<string, readonly string[]>>;
	readonly commandPolicy?: ICommandPolicy;
}

const scopesOf = async (options: IRunAllToolOptions): Promise<IScopeMap> =>
	resolveScopes(
		options.reader,
		options.optionScopes ? { scopes: options.optionScopes } : {},
	);

/**
 * `quality_run_all` — runs every configured scope (not just one) and
 * returns a single aggregated payload. A thin tool wrapper around
 * {@link runAllScopes}; it does not duplicate `get_quality_scopes`'/
 * `run_quality`'s scope-resolution or per-command logic.
 */
export const buildRunAllToolRegistration = (
	options: IRunAllToolOptions,
): IToolRegistration => ({
	id: 'quality_run_all',
	effects: ['spawn'],
	summary:
		'Run every configured quality scope and return one aggregated pass/fail report.',
	tags: ['quality'],
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_quality_run_all`,
			{
				description:
					'Run every configured quality scope (lint/test/build/typecheck/…) in turn and return one aggregated report: per-scope {scope, ok, duration, errors[]} plus a global summary.ok. Use this instead of calling run_quality once per scope. This DOES execute the project’s commands.',
				inputSchema: z.object({}),
				outputSchema: z.object({
					results: z.array(
						z.object({
							scope: z.string(),
							ok: z.boolean(),
							duration: z.number(),
							errors: z.array(z.string()),
						}),
					),
					summary: z.object({
						ok: z.boolean(),
						scopes: z.number(),
					}),
				}),
			},
			async () => {
				const scopes = await scopesOf(options);
				const names = Object.keys(scopes);
				if (names.length === 0) {
					return toolError(
						'no quality scopes configured',
						'Add scripts to package.json, a validationMatrix to mcp-vertex.config.json, or `scopes` to the plugin options.',
					);
				}
				return toolJson(
					await runAllScopes(
						scopes,
						options.workspaceRoot,
						options.run,
						options.commandPolicy,
					),
				);
			},
		);
	},
});
