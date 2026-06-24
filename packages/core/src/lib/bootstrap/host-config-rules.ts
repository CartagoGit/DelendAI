// host-config-rules: declarative table for "does the project's
// host-config.ts declare custom extraTools?".
//
// SOLID — Open/Closed. The previous `detectCustomExtraTools` was
// a 4-step inline transformation in `analyze-project.ts` (read the
// file → regex-extract the `extraTools` array → strip comments →
// strip the scaffold helper → look for a function-call pattern).
// Adding a new evidence kind (e.g. a custom `prompts` block) meant
// editing that body. The table form lets you add a new kind by
// appending one entry.
//
// SOLID — Single Responsibility. This module owns ONE thing: the
// "host-config has custom bits" detection policy. The matcher is
// pure pipeline. The `host-config.ts` is read once and the
// evidence rules consume a pre-computed `stripped` view of the
// file body (with comments + the scaffold helper removed), so
// the table only declares **what to look for** in the stripped
// view — not how to clean the file.
//
// SOLID — Dependency Inversion. Hosts inject their own rule list.

import type { IFileReader } from './analyze-project';

/**
 * The pre-processed `host-config.ts` view the matcher consumes.
 * Comments and the canonical `buildScaffoldToolRegistration(...)`
 * call are already stripped, so a rule only has to declare the
 * pattern that, when found, signals "this project ships custom
 * extra tools". A rule may also pull from the raw file (e.g. when
 * looking for a marker string in the unprocessed body).
 */
export interface IHostConfigContext {
	readonly filePath: string;
	/** The file contents, or `undefined` if the file is not present. */
	readonly raw: string | undefined;
	/**
	 * The `extraTools: [...]` array body, or `undefined` if the file
	 * does not declare an `extraTools` block.
	 */
	readonly extraToolsBlock: string | undefined;
	/**
	 * `extraToolsBlock` with comments + the scaffold helper
	 * already removed. Empty string when no block or only the
	 * scaffold helper was present.
	 */
	readonly stripped: string;
}

/**
 * The evidence kinds a host-config rule can match. `extra-tools`
 * rules look at `context.stripped` (a function-call pattern that
 * survives comment + scaffold stripping); `raw-marker` rules look
 * at `context.raw` (a string in the unprocessed file).
 */
export type IHostConfigEvidence =
	| {
			readonly kind: 'extra-tools';
			/** Regex pattern. A match in `context.stripped` triggers the rule. */
			readonly pattern: string;
	  }
	| {
			readonly kind: 'raw-marker';
			/** A literal string the file must contain for the rule to fire. */
			readonly marker: string;
	  };

export interface IHostConfigRule {
	readonly id: string;
	readonly priority: number;
	readonly evidence: IHostConfigEvidence;
}

/**
 * The default rule: a project that ships custom extra tools
 * beyond the scaffold helper has at least one remaining
 * function-call pattern in the `extraTools` array.
 */
export const DEFAULT_HOST_CONFIG_RULES: readonly IHostConfigRule[] = [
	{
		id: 'custom-extra-tools',
		priority: 100,
		evidence: {
			kind: 'extra-tools',
			// A function call: an identifier followed by `(`. The
			// scaffold helper has already been stripped, so anything
			// matching this is a real custom tool.
			pattern: '[A-Za-z0-9_$]+\\s*\\(',
		},
	},
];

/**
 * Pure: read the `host-config.ts` (if any) and produce the
 * matcher context. The two candidates are
 * `libs/mcp-project/src/lib/shared/host-config.ts` (the mcp-vertex
 * monorepo layout) and `src/lib/shared/host-config.ts` (the
 * standalone project layout). The first hit wins.
 */
const HOST_CONFIG_CANDIDATES: readonly string[] = [
	'libs/mcp-project/src/lib/shared/host-config.ts',
	'src/lib/shared/host-config.ts',
];

const readContext = async (
	reader: IFileReader,
): Promise<IHostConfigContext> => {
	for (const filePath of HOST_CONFIG_CANDIDATES) {
		const raw = await reader.readFile(filePath);
		if (raw === undefined) continue;
		const match = /extraTools\s*:\s*\[([\s\S]*?)\]/m.exec(raw);
		const extraToolsBlock = match?.[1];
		const withoutComments = (extraToolsBlock ?? '')
			.replace(/\/\*[\s\S]*?\*\//g, '')
			.replace(/\/\/.*$/gm, '');
		const stripped = withoutComments.replace(
			/buildScaffoldToolRegistration\s*\([\s\S]*?\)\s*,?/g,
			'',
		);
		return { filePath, raw, extraToolsBlock, stripped };
	}
	return {
		filePath: '',
		raw: undefined,
		extraToolsBlock: undefined,
		stripped: '',
	};
};

const matches = (ctx: IHostConfigContext, rule: IHostConfigRule): boolean => {
	if (rule.evidence.kind === 'raw-marker') {
		if (ctx.raw === undefined) return false;
		return ctx.raw.includes(rule.evidence.marker);
	}
	// extra-tools: match the regex against the stripped body.
	if (ctx.stripped === '') return false;
	return new RegExp(rule.evidence.pattern).test(ctx.stripped);
};

export const matchHostConfig = async (
	reader: IFileReader,
	rules: readonly IHostConfigRule[] = DEFAULT_HOST_CONFIG_RULES,
): Promise<readonly string[]> => {
	const ctx = await readContext(reader);
	const sorted = [...rules].sort((a, b) => b.priority - a.priority);
	const hits: string[] = [];
	for (const rule of sorted) {
		if (matches(ctx, rule)) hits.push(rule.id);
	}
	return hits;
};
