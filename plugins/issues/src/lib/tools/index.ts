/**
 * Assembles the 5 `issues_*` tool registrations for the plugin's
 * `register(ctx)` (wired in `src/index.ts`). Single Responsibility:
 * this module only composes — each tool's own logic lives in its
 * dedicated `*.tool.ts` file.
 */
import type { IToolRegistration } from '@mcp-vertex/core/public';

import { buildAnalyzeIssueRegistration } from './analyze-issue.tool';
import { buildFetchIssueRegistration } from './fetch-issue.tool';
import { buildIngestIssueRegistration } from './ingest-issue.tool';
import type { IGithubClient } from './list-issues.tool';
import { buildListIssuesRegistration } from './list-issues.tool';
import { buildResolveIssueRegistration } from './resolve-issue.tool';

export type { IGithubClient } from './list-issues.tool';

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

/** Builds the 5 `<namespacePrefix>_issues_*` tool registrations. */
export const buildIssuesToolRegistrations = (
	options: IBuildIssuesToolRegistrationsOptions,
): readonly IToolRegistration[] => [
	buildListIssuesRegistration({
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
		scaffoldDirAbs: options.scaffoldDirAbs,
	}),
	buildAnalyzeIssueRegistration({
		namespacePrefix: options.namespacePrefix,
		githubClient: options.githubClient,
		scaffoldDirAbs: options.scaffoldDirAbs,
	}),
	buildResolveIssueRegistration({
		namespacePrefix: options.namespacePrefix,
		scaffoldDirAbs: options.scaffoldDirAbs,
	}),
];
