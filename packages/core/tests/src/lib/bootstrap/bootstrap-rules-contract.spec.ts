import { describe, expect, it } from 'vitest';

import * as agentConfigRules from '../../../../src/lib/bootstrap/agent-config-rules';
import * as ciRules from '../../../../src/lib/bootstrap/ci-rules';
import * as frameworkRules from '../../../../src/lib/bootstrap/framework-rules';
import * as languageRules from '../../../../src/lib/bootstrap/language-rules';
import * as mcpEvidenceRules from '../../../../src/lib/bootstrap/mcp-evidence-rules';
import * as monorepoRules from '../../../../src/lib/bootstrap/monorepo-rules';
import * as packageManagerRules from '../../../../src/lib/bootstrap/package-manager-rules';
import * as projectTypeRules from '../../../../src/lib/bootstrap/project-type-rules';

/**
 * bootstrap-rules-contract.spec.ts — pins the common shape of every
 * `packages/core/src/lib/bootstrap/*-rules.ts` module.
 *
 * The bootstrap layer is built around a single architectural pattern:
 * one rule table per concern (package manager, monorepo tool, CI,
 * framework, language, agent config, project type, mcp evidence) +
 * one pure matcher per table. Adding a new concern is a new file +
 * one entry in `analyze-project.ts`; adding a new rule is a one-line
 * table edit. This spec pins the **contract** that makes OCP work
 * across all 8 rule tables at once.
 *
 * SOLID:
 *   - DIP — the spec depends on a small `IBootstrapRule` interface,
 *          not on each concrete rule shape. New rule tables inherit
 *          the contract by exporting `DEFAULT_X_RULES` of that shape.
 *   - ISP — the contract is the minimum useful surface: a `readonly id`
 *          (so the matcher can return it) and a `readonly priority`
 *          (so the matcher can sort by it). Anything else is opt-in
 *          per table.
 *   - OCP — extending the contract (e.g. adding a `readonly tags`
 *          field) is a one-line spec edit; concrete rule tables pick
 *          it up automatically when they extend `IBootstrapRule`.
 */

/** Contract for the dominant rule-table shape: each rule carries
 *  a `readonly id` (the matcher returns it on a hit) and a
 *  `readonly priority` (the matcher sorts by it). 7 of the 8 tables
 *  follow this shape. */
interface IIdRule {
	readonly id: string;
	readonly priority: number;
}

/** Contract variant for `project-type-rules`: that table's rule
 *  resolves to a typed `result` (the `IProjectType` enum value) plus
 *  a `matches(ctx)` predicate. We split it from `IIdRule` rather
 *  than collapsing both into one mega-interface — that's ISP.
 */
interface IResultRule<TResult extends string> {
	readonly result: TResult;
	readonly priority: number;
}

/** A rule table is the tuple `(module, defaultRules, matcher)`. Both
 *  `defaultRules` and `matcher` must be exported from the same
 *  module under their canonical names. */
interface IIdRuleTable<TMatcher extends (...args: never[]) => unknown> {
	readonly module: string;
	readonly defaultRules: readonly IIdRule[];
	readonly matcher: TMatcher;
}

interface IResultRuleTable<
	TResult extends string,
	TMatcher extends (...args: never[]) => unknown,
> {
	readonly module: string;
	readonly defaultRules: readonly IResultRule<TResult>[];
	readonly matcher: TMatcher;
}

const ID_RULE_TABLES = [
	{
		module: 'agent-config-rules',
		defaultRules:
			agentConfigRules.DEFAULT_AGENT_CONFIG_RULES as readonly IIdRule[],
		matcher: agentConfigRules.matchAgentConfigs,
	},
	{
		module: 'ci-rules',
		defaultRules: ciRules.DEFAULT_CI_RULES as readonly IIdRule[],
		matcher: ciRules.matchCi,
	},
	{
		module: 'framework-rules',
		defaultRules:
			frameworkRules.DEFAULT_FRAMEWORK_RULES as readonly IIdRule[],
		matcher: frameworkRules.matchFramework,
	},
	{
		module: 'language-rules',
		defaultRules:
			languageRules.DEFAULT_LANGUAGE_RULES as readonly IIdRule[],
		matcher: languageRules.matchLanguage,
	},
	{
		module: 'mcp-evidence-rules',
		defaultRules:
			mcpEvidenceRules.DEFAULT_MCP_EVIDENCE_RULES as readonly IIdRule[],
		matcher: mcpEvidenceRules.detectMcpEvidence,
	},
	{
		module: 'monorepo-rules',
		defaultRules:
			monorepoRules.DEFAULT_MONOREPO_RULES as readonly IIdRule[],
		matcher: monorepoRules.matchMonorepoTool,
	},
	{
		module: 'package-manager-rules',
		defaultRules:
			packageManagerRules.DEFAULT_PACKAGE_MANAGER_RULES as readonly IIdRule[],
		matcher: packageManagerRules.matchPackageManager,
	},
] as const satisfies readonly IIdRuleTable<(...args: never[]) => unknown>[];

const RESULT_RULE_TABLES = [
	{
		module: 'project-type-rules',
		defaultRules:
			projectTypeRules.DEFAULT_PROJECT_TYPE_RULES as readonly IResultRule<string>[],
		matcher: projectTypeRules.matchProjectType,
	},
] as const satisfies readonly IResultRuleTable<
	string,
	(...args: never[]) => unknown
>[];

describe('bootstrap rule tables — id+priority contract (7 tables)', async () => {
	for (const table of ID_RULE_TABLES) {
		describe(table.module, async () => {
			it('exposes a non-empty DEFAULT_X_RULES array', async () => {
				expect(Array.isArray(table.defaultRules)).toBe(true);
				expect(table.defaultRules.length).toBeGreaterThan(0);
			});

			it('every rule carries a numeric priority (sortable)', async () => {
				for (const rule of table.defaultRules) {
					expect(typeof rule.priority).toBe('number');
					expect(Number.isFinite(rule.priority)).toBe(true);
				}
			});

			it('exposes a matcher function (default + custom rules args)', async () => {
				expect(typeof table.matcher).toBe('function');
			});

			it('every rule carries a unique id (the strict contract — no tolerated duplicates)', async () => {
				// The cursor case is now modelled as ONE rule with a
				// `paths: ['.cursorrules', '.cursor']` array, not two
				// rules with the same id. The unique-id contract holds
				// across all 7 id-based tables.
				const ids = table.defaultRules.map((r) => r.id);
				expect(new Set(ids).size).toBe(ids.length);
			});
		});
	}
});

describe('bootstrap rule tables — result+priority contract (1 table: project-type)', async () => {
	for (const table of RESULT_RULE_TABLES) {
		describe(table.module, async () => {
			it('exposes a non-empty DEFAULT_PROJECT_TYPE_RULES array', async () => {
				expect(table.defaultRules.length).toBeGreaterThan(0);
			});

			it('every rule carries a non-empty string result', async () => {
				for (const rule of table.defaultRules) {
					expect(typeof rule.result).toBe('string');
					expect(rule.result.length).toBeGreaterThan(0);
				}
			});

			it('every rule carries a numeric priority', async () => {
				for (const rule of table.defaultRules) {
					expect(typeof rule.priority).toBe('number');
				}
			});

			it('exposes a matcher function', async () => {
				expect(typeof table.matcher).toBe('function');
			});
		});
	}
});

/**
 * Drift guard — count must stay at exactly 8 (7 id-based + 1
 * result-based). Adding a 9th rule table without registering it
 * here is silently broken until something downstream looks up the
 * new concern.
 */
describe('bootstrap rule tables — drift guard', async () => {
	it('exactly 8 rule tables are registered in this spec', async () => {
		expect(ID_RULE_TABLES.length + RESULT_RULE_TABLES.length).toBe(8);
	});
});
