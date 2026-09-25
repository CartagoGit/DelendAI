/**
 * Assembles the 5 `issues_*` tool registrations for the plugin's
 * `register(ctx)` (wired in `src/index.ts`). Single Responsibility:
 * this module only composes — each tool's own logic lives in its
 * dedicated `*.tool.ts` file.
 */
import type { IToolRegistration } from '@delendai/core/public';
import { callerCheckout } from '@delendai/core/public';

import { buildAnalyzeIssueRegistration } from './analyze-issue.tool';
import { buildFetchIssueRegistration } from './fetch-issue.tool';
import { buildIngestIssueRegistration } from './ingest-issue.tool';
import { buildListAdvisoriesRegistration } from './list-advisories.tool';
import { buildListCodeScanningRegistration } from './list-code-scanning.tool';
import { buildListDependabotRegistration } from './list-dependabot.tool';
import type { IGithubClient } from '../contracts';
import { buildListIssuesRegistration } from './list-issues.tool';
import { buildListSecretScanningRegistration } from './list-secret-scanning.tool';
import { buildResolveIssueRegistration } from './resolve-issue.tool';

export { buildSetupGithubRegistration } from './setup-github.tool';

export interface IBuildIssuesToolRegistrationsOptions {
	/** Tool namespace, e.g. `'issues'` → `issues_list`, `issues_fetch`, … */
	readonly namespacePrefix: string;
	/** `'owner/name'` GitHub repo this plugin instance talks to. */
	readonly repo: string;
	/** Absolute, workspace-contained path to the scaffold directory. */
	readonly scaffoldDirAbs: string;
	/** Absolute workspace root (reserved for future git-aware tools). */
	readonly repoRoot: string;
	/** Injectable GitHub client (production: adapts `github-client.ts`; tests: a fake). */
	readonly githubClient: IGithubClient;
}

/** Builds the 9 `<namespacePrefix>_issues_*` tool registrations. */
export const buildIssuesToolRegistrations = (
	options: IBuildIssuesToolRegistrationsOptions,
): readonly IToolRegistration[] => {
	// The scaffold directory was resolved against the server's root; a
	// call bound to another checkout reads and writes its own. Read per
	// call through the getters below, never once at registration.
	const scaffoldDirForCall = (): string =>
		callerCheckout.pathForCall(options.scaffoldDirAbs, options.repoRoot);
	return [
		buildListIssuesRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildListDependabotRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildListCodeScanningRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildListSecretScanningRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildListAdvisoriesRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildFetchIssueRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
		}),
		buildIngestIssueRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
			get scaffoldDirAbs() {
				return scaffoldDirForCall();
			},
		}),
		buildAnalyzeIssueRegistration({
			namespacePrefix: options.namespacePrefix,
			githubClient: options.githubClient,
			get scaffoldDirAbs() {
				return scaffoldDirForCall();
			},
		}),
		buildResolveIssueRegistration({
			namespacePrefix: options.namespacePrefix,
			get scaffoldDirAbs() {
				return scaffoldDirForCall();
			},
		}),
	];
};
