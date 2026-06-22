/**
 * Public surface of `@mcp-vertex/issues`. The default export (in
 * `../index.ts`) is the loadable `IMcpPlugin`; this barrel exposes
 * only the plugin's data contracts for programmatic reuse. The
 * `dependsOn` enforcement is a loader concern
 * (`packages/core/src/lib/plugins/load-plugins.ts`), not something
 * this plugin surfaces itself.
 */
export { default } from '../index';

export type {
	IGithubIssueSummary,
	IGithubIssueDetail,
	IGithubComment,
	IIssueScaffold,
	IIssueScaffoldFrontmatter,
	IIssueScaffoldRef,
} from '../lib/contracts';
