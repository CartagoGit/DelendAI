import z from 'zod';

import type {
	IFileReader,
	ILogsSink,
	IToolRegistration,
} from '@delendai/core/public';
import {
	compactOutputSchema,
	toolError,
	toolJson,
	withIncidentLogging,
} from '@delendai/core/public';

import type { ICommandPolicy } from './command-policy';
import type { ICommandRunner, QualityRunMode, IScopeCommand } from './runner';
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
	readonly firstFailure: string | null;
}

export interface IQualityRunAllReport {
	readonly results: readonly IQualityAllResult[];
	readonly summary: {
		readonly ok: boolean;
		readonly scopes: number;
		readonly duration: number;
		readonly firstFailure: string | null;
	};
}

export interface IQualityRunAllOptions {
	readonly mode?: QualityRunMode | undefined;
	/** Maximum concurrent scopes. Defaults to one to avoid resource contention. */
	readonly maxParallel?: number | undefined;
}

/**
 * Run every scope in `scopes`, in stable key order, aggregating each into
 * `{scope, ok, duration, errors[], firstFailure}`. A scope's `errors` lists
 * the `tail` of every failing command (empty when the scope passed).
 * `summary.ok` is `true` only when every scope passed. Parallelism is bounded
 * by `maxParallel`, which defaults to one for conservative resource use.
 */
export const runAllScopes = async (
	scopes: IScopeMap,
	cwd: string,
	run: ICommandRunner,
	policy?: ICommandPolicy,
	options: IQualityRunAllOptions = {},
): Promise<IQualityRunAllReport> => {
	const startedAt = Date.now();
	const entries = Object.entries(scopes);
	const results = new Array<IQualityAllResult>(entries.length);
	const maxParallel = Math.max(1, Math.floor(options.maxParallel ?? 1));
	let nextIndex = 0;
	const worker = async (): Promise<void> => {
		while (true) {
			const index = nextIndex++;
			const entry = entries[index];
			if (entry === undefined) return;
			const [scope, commands] = entry;
			const outcome = await runScope(
				scope,
				commands as readonly IScopeCommand[],
				cwd,
				run,
				policy,
				options.mode,
			);
			results[index] = {
				scope,
				ok: outcome.ok,
				duration: outcome.duration,
				errors: outcome.results
					.filter((result) => !result.ok)
					.map((result) => `${result.command}: ${result.tail}`),
				firstFailure: outcome.firstFailure
					? `${outcome.firstFailure.command}: ${outcome.firstFailure.tail}`
					: null,
			};
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(maxParallel, entries.length) }, worker),
	);
	const firstFailure =
		results.find((result) => !result.ok)?.firstFailure ?? null;
	return {
		results,
		summary: {
			ok: results.every((r) => r.ok),
			scopes: results.length,
			duration: Date.now() - startedAt,
			firstFailure,
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
	/**
	 * x00190 follow-up: `quality_run_all` was added after f00154 S3 wired
	 * incident logging into `run_quality` and never got the same wrapper
	 * — its `toolError` path silently emitted no incident even though
	 * `index.ts` already passes a `logsSink` into this same options
	 * object (the field just wasn't declared/read here).
	 */
	readonly logsSink?: ILogsSink;
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
					'Run every configured quality scope and return aggregate diagnostics. Defaults to local fail-fast; use mode=collect in CI. The report includes per-scope firstFailure and duration plus summary firstFailure and wall-clock duration. maxParallel is bounded to four. This DOES execute the project’s commands.',
				inputSchema: z.object({
					mode: z.enum(['fail-fast', 'collect']).optional(),
					maxParallel: z.number().int().min(1).max(4).optional(),
				}),
				outputSchema: compactOutputSchema(),
			},
			withIncidentLogging(
				{ incidentType: 'quality-failure' },
				options.logsSink !== undefined
					? { logsSink: options.logsSink }
					: {},
				async (args: {
					mode?: QualityRunMode | undefined;
					maxParallel?: number | undefined;
				}) => {
					const scopes = await scopesOf(options);
					const names = Object.keys(scopes);
					if (names.length === 0) {
						return toolError(
							'no quality scopes configured',
							'Add scripts to package.json, a validationMatrix to `<config-file>`, or `scopes` to the plugin options.',
						);
					}
					return toolJson(
						await runAllScopes(
							scopes,
							options.workspaceRoot,
							options.run,
							options.commandPolicy,
							args,
						),
					);
				},
			),
		);
	},
});
