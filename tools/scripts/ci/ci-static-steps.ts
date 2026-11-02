/**
 * ci-static-steps.ts — the static checks a pull request runs, read from
 * the workflow that runs them, so the local proof runs exactly those.
 *
 * The local proof listed four gates by hand while the forge ran nine jobs
 * of lints. Every lint only the forge ran was a red pull request waiting
 * to happen: #1582 failed `spec-timeout-undercut`, which no local step
 * ran. A second list would drift from the first the day a lint is added,
 * so there is no second list: the steps are read out of `ci.yml`.
 *
 * Only the expressions a pull request's run resolves are substituted, to
 * what they mean locally; a step that uses any other expression is refused
 * rather than run with a guess.
 */
import { parseWorkflowYaml, type YamlValue } from './workflow-yaml';

/** The jobs whose steps are static checks: fast, and needing nothing built. */
export const STATIC_CHECK_JOBS = [
	'lint-biome',
	'lint-architecture',
	'lint-presets',
	'lint-docs',
	'lint-security',
	'lint-governance',
	'quality-gate',
	'manifests-check',
	'generated-artifacts-check',
	'tokens-budget-real',
] as const;

/**
 * The checks that run after the others, one at a time: they write what the
 * others read. On the forge every job has its own runner; on one machine
 * `quality-gate` rebuilds `build/` while `lint-presets` walks it, and the
 * walk failed on a file that vanished under it.
 */
export const RUN_ALONE: ReadonlySet<string> = new Set(['quality-gate']);

/** One check: a job's commands, as one script for bash. */
export interface IStaticCheck {
	readonly job: string;
	readonly script: string;
}

const asRecord = (value: YamlValue | undefined): Record<string, YamlValue> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)
		? (value as Record<string, YamlValue>)
		: {};

/** What each expression a static step uses means outside the forge. */
const localExpression = (
	expression: string,
	base: string,
	baseRef: string,
): string | undefined => {
	const known: Readonly<Record<string, string>> = {
		"github.event.pull_request.base.sha || ''": base,
		"github.event.pull_request.base.sha || 'origin/develop'": base,
		'github.event.pull_request.base.sha': base,
		"github.base_ref || 'develop'": baseRef,
		'github.base_ref': baseRef,
		'github.token': '${GH_TOKEN:-}',
	};
	return known[expression.trim()];
};

/**
 * The static checks of a workflow, with their expressions resolved for a
 * local run against `base` (a commit) and `baseRef` (the branch name).
 * Throws when a job is missing or a step uses an expression it cannot
 * resolve: a check that cannot be reproduced is not silently dropped.
 */
export const staticChecksOf = (
	workflowText: string,
	base: string,
	baseRef: string,
): readonly IStaticCheck[] => {
	const jobs = asRecord(parseWorkflowYaml(workflowText).jobs);
	return STATIC_CHECK_JOBS.map((job) => {
		if (!(job in jobs)) {
			throw new Error(
				`ci.yml has no \`${job}\` job to read the checks of`,
			);
		}
		const steps = asRecord(jobs[job]).steps;
		const runs = (Array.isArray(steps) ? steps : [])
			.map((step) => asRecord(step).run)
			.filter((run): run is string => typeof run === 'string');
		const script = runs
			.join('\n')
			.replace(/\$\{\{([^}]*)\}\}/gu, (whole, expression: string) => {
				const local = localExpression(expression, base, baseRef);
				if (local === undefined) {
					throw new Error(
						`\`${job}\` uses \`${whole}\`, which has no local meaning`,
					);
				}
				return local;
			});
		return { job, script };
	});
};
