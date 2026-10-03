/**
 * f00131 — public surface for the `changelog` plugin.
 *
 * Re-exports the S1 renderer + the S2 bump / release-plan modules so
 * plugin authors (and the host's release script, when it grows a
 * publish-order preview tool) can build on the same shape without
 * forking the contracts.
 */
// S1 — render
export {
	parseConventionalCommit,
	type IConventionalCommit,
	type CommitType,
} from '../lib/render/conventional-commit';
export {
	groupByType,
	type IChangelogSection,
} from '../lib/render/group-by-type';
export { renderMarkdown } from '../lib/render/render-markdown';

// S2.a — semver bump inference
export { inferBump } from '../lib/bump/infer-bump';
export type { IBumpInference, IBumpKind } from '../lib/bump/infer-bump';

// S2.b — release plan preview
export {
	buildReleasePlan,
	buildReleasePlanToolRegistration,
} from '../lib/tools/release-plan.tool';
export type {
	IPublishOrderEntry,
	IReleasePlanOutput,
	IReleasePlanToolOptions,
} from '../lib/tools/release-plan.tool';

// S1 — tool registrations
export { buildChangelogGenerateToolRegistration } from '../lib/tools/changelog-generate.tool';
export type { IChangelogGenerateToolOptions } from '../lib/tools/changelog-generate.tool';
