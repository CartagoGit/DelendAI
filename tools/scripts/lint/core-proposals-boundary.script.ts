#!/usr/bin/env bun

import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_SCAN_ROOT = 'packages/core/src';
const SKIP_SEGMENTS: readonly string[] = ['/generated/'];
const SKIP_SUFFIXES: readonly string[] = ['.generated.ts'];
const SOURCE_FILE = /\.(?:[cm]?ts|tsx)$/;
const IMPORT_SPECIFIER =
	/\b(?:import|export)\b(?:[\s\S]*?\bfrom\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|require\s*\(\s*["']([^"']+)["']\s*\)/g;
const STRING_LITERAL = /(["'`])(?:\\[\s\S]|(?!\1)[\s\S])*?\1/g;

export type TBoundaryMatchKind = 'import' | 'path' | 'literal';
export type TBoundaryExceptionClass =
	| 'adapter'
	| 'compatibility'
	| 'host-composition';

export interface ICoreProposalsBoundaryException {
	readonly file: string;
	readonly needle: string;
	readonly until: string;
	readonly classification: TBoundaryExceptionClass;
	readonly reason: string;
	readonly kind?: TBoundaryMatchKind;
}

export interface ICoreProposalsBoundaryMatch {
	readonly absPath: string;
	readonly relPath: string;
	readonly line: number;
	readonly kind: TBoundaryMatchKind;
	readonly token: string;
	readonly snippet: string;
}

export interface ICoreProposalsBoundaryViolation
	extends ICoreProposalsBoundaryMatch {
	readonly code: 'unclassified' | 'expired-exception';
	readonly exception?: ICoreProposalsBoundaryException;
}

export interface ICoreProposalsBoundaryScanResult {
	readonly scannedFiles: number;
	readonly matches: readonly ICoreProposalsBoundaryMatch[];
	readonly allowed: readonly {
		readonly match: ICoreProposalsBoundaryMatch;
		readonly exception: ICoreProposalsBoundaryException;
	}[];
	readonly violations: readonly ICoreProposalsBoundaryViolation[];
	readonly expired: readonly ICoreProposalsBoundaryViolation[];
}

interface IBoundaryTokenRule {
	readonly token: string;
	readonly kind: TBoundaryMatchKind;
	readonly test: (value: string) => boolean;
}

const TOKEN_RULES: readonly IBoundaryTokenRule[] = [
	{
		token: '@mcp-vertex/proposals',
		kind: 'import',
		test: (value) => value.includes('@mcp-vertex/proposals'),
	},
	{
		token: 'lib/proposals',
		kind: 'import',
		test: (value) => /(?:^|\/)lib\/proposals(?:\/|$)/.test(value),
	},
	{
		token: '/proposals/',
		kind: 'path',
		test: (value) => value.includes('/proposals/'),
	},
	{
		token: 'proposal-tool-id',
		kind: 'literal',
		test: (value) =>
			/\b(?:create_proposal|sync_proposals|get_proposal_workflow|proposal_transition|mcp-vertex_proposals_[a-z_]+)\b/.test(
				value,
			),
	},
	{
		token: 'proposals-domain',
		kind: 'literal',
		test: (value) => /\bproposals\b/.test(value),
	},
];

export const CORE_PROPOSALS_BOUNDARY_EXCEPTIONS: readonly ICoreProposalsBoundaryException[] =
	[
		{
			file: 'packages/core/src/public/index.ts',
			needle: '../lib/proposals/validate-evidence.schema',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'Public compatibility re-export keeps the validate-evidence schema on its historic subpath while downstream consumers migrate.',
			kind: 'import',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: '# Proposals',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Adoption copy still documents the proposals store layout until the workflow store bootstrap moves fully behind plugin-owned adapters.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'This folder is the proposals store managed by the mcp-vertex',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Bootstrap prose still explains the proposals store to adopters.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: '`proposals` plugin. Each proposal is one markdown file with',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'The adoption adapter still names the proposals plugin explicitly.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'Create proposals with the `create_proposal` tool (it allocates the',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Bootstrap guidance still points at the current proposals authoring tool ids.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'index is regenerated at any time via `sync_proposals`.',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Bootstrap guidance still references the plugin-owned index refresh command.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: '${docsDir}/proposals/${folder}/.gitkeep',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'The adoption adapter still materializes the proposals store layout under docsDir.',
			kind: 'path',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: '${docsDir}/proposals/README.md',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'The adoption adapter still materializes the proposals README path under docsDir.',
			kind: 'path',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'Bootstrapped proposals store files (.gitkeep per status + README).',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'The write estimate still reports the proposals store as an adapter-owned artifact.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adoption-assessment.service.ts',
			needle: 'Estimated adopt_project write surface (config + agents/instructions + proposals store).',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'The assessment summary still reports the plugin-backed proposals store write surface.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'move them with `proposal_transition`',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Bootstrap guidance still points at the current proposals workflow tool ids.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adopt-project-write-estimate.ts',
			needle: 'ask `get_proposal_workflow` for the full convention.',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Bootstrap guidance still points at the current proposals workflow tool ids.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/bootstrap/body-content/prompt-bodies.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Blueprint prompt bodies still explain the loaded proposals workflow to the host.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/bootstrap/build-blueprint.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Blueprint composition still gates swarm subagents on whether the proposals plugin is present.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/bootstrap/derive-config.ts',
			needle: 'proposal workflow (proposals + coordination)',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Derived-config rationale still names the swarm preset payload in host-facing prose.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/bootstrap/pattern-catalog.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The pattern catalog still recommends loading the proposals plugin for coordinated work patterns.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/bootstrap/prompt-artifact-rules.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Prompt artifact inclusion is still keyed off the proposals plugin id.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/catalog/agent-discovery-types.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The discovery snapshot still exposes a dedicated proposals section to hosts.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/cli/assemble-core-tools.ts',
			needle: 'bootstraps the proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The no-config onboarding message still describes the proposals store bootstrap explicitly.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/cli/assemble-skills.ts',
			needle: 'do not hand-create proposals or docs outside the server workflow.',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The config-mismatch guidance still names proposals as part of the docs workflow boundary.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/cli/assemble-skills.ts',
			needle: 'config + agents + proposals store',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'First-run guidance still refers to the proposals store as part of host composition.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/cli/read-proposals-index.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'Legacy compact catalog entries are still sourced from the cached proposals index artifact.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/contracts/constants/token-budgets.constant.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'Token-budget fixtures still pin proposals as a representative plugin id.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/contracts/file-conventions.contract.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'The canonical file-conventions contract still models the proposals folder name explicitly.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/knowledge/host-onboarding.knowledge.ts',
			needle: 'docs/mcp-vertex/proposals/',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Host-onboarding knowledge still documents the default proposal store path layout.',
			kind: 'path',
		},
		{
			file: 'packages/core/src/lib/plugins/preset-catalog.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Preset composition still includes the proposals plugin in swarm/full host presets.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/plugins/preset-derived.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Derived preset members still materialize the proposals plugin in host composition.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/plugins/diagnose-workspace-layout.ts',
			needle: 'proposals layout',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Workspace diagnostics still explain the docsDir/proposals layout relation to the host.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/plugins/plugin-defaults.ts',
			needle: 'docs/proposals/retired/issues',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'Plugin defaults still point issues scaffolding at the historical proposals docs tree.',
			kind: 'path',
		},
		{
			file: 'packages/core/src/lib/plugins/plugin-defaults.ts',
			needle: 'docs/mcp-vertex/proposals/done/audits',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'Plugin defaults still point audits at the historical proposals docs tree.',
			kind: 'path',
		},
		{
			file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
			needle: 'tools/skills/proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The bootstrap prompt still advertises proposals as one of the catalog slices.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
			needle: 'actionable proposals available right now.',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The bootstrap prompt still refers to actionable proposals in the compact catalog.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/prompts/agent-bootstrap.prompt.ts',
			needle: 'Actionable proposals:',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The bootstrap prompt still refers to actionable proposals in the compact catalog.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/resources/agent-catalog-resource.ts',
			needle: 'actionable proposals.',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The catalog resource still describes the proposals slice exposed to hosts.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/resources/agent-catalog-resource.ts',
			needle: 'proposal registry.',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The catalog resource still documents the full proposal registry view for hosts.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/scaffold/scaffold-host.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Generated host instructions still describe the proposals workflow when that plugin is loaded.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/scaffold/scaffold-host.ts',
			needle: 'mcp-vertex --plugins=proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Generated host instructions still show the proposals plugin launch example explicitly.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/setup/setup-steps.ts',
			needle: 'Load the host with proposals + issues',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The setup guide still documents the required plugin pair for the issues workflow.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/setup/setup-steps.ts',
			needle: 'issues hard-depends on proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'Setup guidance still documents the current issues/proposals loading dependency.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/setup/setup-steps.ts',
			needle: 'mcp-vertex --plugins=proposals,issues',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The setup guide still needs a concrete launch command for the issues workflow.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/tools/agent-catalog-tool.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The host discovery surface still exposes a proposals section explicitly.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/tools/overview-tool.ts',
			needle: 'proposals: ["agent_lock", …]',
			until: '2027-03-31',
			classification: 'host-composition',
			reason: 'The overview tool still documents compact grouping with a proposals example.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/contracts/release/index.ts',
			needle: 'release metadata proposals must be non-empty strings',
			until: '2027-03-31',
			classification: 'compatibility',
			reason: 'The release contract surfaces the human-readable error in the validator message; the term is generic English for "proposal items" in the metadata map and does not bind to the proposals plugin.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adoption-stages.constant.ts',
			needle: 'proposals+agents',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Adoption stage title groups the proposals and agent-orchestrator plugins in the day-to-day workflow stage; the title is a human-readable label for adoption copy.',
			kind: 'literal',
		},
		{
			file: 'packages/core/src/lib/adopt/adoption-stages.constant.ts',
			needle: 'proposals',
			until: '2027-03-31',
			classification: 'adapter',
			reason: 'Adoption stage pluginId list literally names the proposals plugin to mark the stage as adopted; the boundary lint extracts string literals as bare tokens, so the exception must match the literal itself, not the whole line.',
			kind: 'literal',
		},
	];

const stripComments = (source: string): string =>
	source
		.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
		.replace(
			/(^|[^:])\/\/.*$/gm,
			(match, prefix: string) =>
				prefix + match.slice(prefix.length).replace(/[^\n]/g, ' '),
		);

const lineForOffset = (text: string, offset: number): number => {
	let line = 1;
	for (let index = 0; index < offset; index += 1) {
		if (text.charCodeAt(index) === 10) line += 1;
	}
	return line;
};

const firstMatchingToken = (
	value: string,
): { readonly token: string; readonly kind: TBoundaryMatchKind } | null => {
	for (const rule of TOKEN_RULES) {
		if (rule.test(value)) {
			return { token: rule.token, kind: rule.kind };
		}
	}
	return null;
};

const isInsideSpan = (
	offset: number,
	spans: readonly { readonly start: number; readonly end: number }[],
): boolean => spans.some((span) => offset >= span.start && offset < span.end);

export const collectBoundaryMatches = (
	text: string,
	absPath: string,
	relPath: string,
): readonly ICoreProposalsBoundaryMatch[] => {
	const sanitized = stripComments(text);
	const matches: ICoreProposalsBoundaryMatch[] = [];
	const importSpans: { start: number; end: number }[] = [];

	for (const match of sanitized.matchAll(IMPORT_SPECIFIER)) {
		const specifier = match[1] ?? match[2] ?? match[3];
		if (specifier === undefined) continue;
		const token = firstMatchingToken(specifier);
		if (token === null) continue;
		const start = match.index ?? 0;
		importSpans.push({ start, end: start + match[0].length });
		matches.push({
			absPath,
			relPath,
			line: lineForOffset(sanitized, start),
			kind: token.kind,
			token: token.token,
			snippet: specifier,
		});
	}

	for (const match of sanitized.matchAll(STRING_LITERAL)) {
		const start = match.index ?? 0;
		if (isInsideSpan(start, importSpans)) continue;
		const raw = match[0];
		const value = raw.slice(1, -1);
		const token = firstMatchingToken(value);
		if (token === null) continue;
		matches.push({
			absPath,
			relPath,
			line: lineForOffset(sanitized, start),
			kind: token.kind,
			token: token.token,
			snippet: value,
		});
	}

	return matches;
};

const exceptionMatches = (
	match: ICoreProposalsBoundaryMatch,
	exception: ICoreProposalsBoundaryException,
): boolean =>
	match.relPath === exception.file &&
	(exception.kind === undefined || exception.kind === match.kind) &&
	match.snippet.includes(exception.needle);

const exceptionExpired = (
	exception: ICoreProposalsBoundaryException,
	now: Date,
): boolean => {
	const expiry = Date.parse(`${exception.until}T23:59:59.999Z`);
	return Number.isNaN(expiry) || expiry < now.getTime();
};

export const applyBoundaryExceptions = (
	matches: readonly ICoreProposalsBoundaryMatch[],
	exceptions: readonly ICoreProposalsBoundaryException[] = CORE_PROPOSALS_BOUNDARY_EXCEPTIONS,
	now: Date = new Date(),
): Pick<
	ICoreProposalsBoundaryScanResult,
	'allowed' | 'violations' | 'expired'
> => {
	const allowed: {
		match: ICoreProposalsBoundaryMatch;
		exception: ICoreProposalsBoundaryException;
	}[] = [];
	const violations: ICoreProposalsBoundaryViolation[] = [];
	const expired: ICoreProposalsBoundaryViolation[] = [];

	for (const match of matches) {
		const exception = exceptions.find((entry) =>
			exceptionMatches(match, entry),
		);
		if (exception === undefined) {
			violations.push({ ...match, code: 'unclassified' });
			continue;
		}
		if (exceptionExpired(exception, now)) {
			const violation: ICoreProposalsBoundaryViolation = {
				...match,
				code: 'expired-exception',
				exception,
			};
			expired.push(violation);
			violations.push(violation);
			continue;
		}
		allowed.push({ match, exception });
	}

	return { allowed, violations, expired };
};

const walk = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (
					entry.name === 'node_modules' ||
					entry.name === 'dist' ||
					entry.name === 'coverage'
				) {
					continue;
				}
				stack.push(full);
				continue;
			}
			if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
				out.push(full);
			}
		}
	}
	return out;
};

export const scanCoreProposalsBoundaryLint = async (
	root: string = REPO_ROOT,
	scanRoot: string = DEFAULT_SCAN_ROOT,
	now: Date = new Date(),
): Promise<ICoreProposalsBoundaryScanResult> => {
	const absRoot = isAbsolute(scanRoot) ? scanRoot : join(root, scanRoot);
	const files = await walk(absRoot);
	const matches: ICoreProposalsBoundaryMatch[] = [];
	for (const file of files) {
		const relPath = relative(root, file);
		if (SKIP_SEGMENTS.some((segment) => relPath.includes(segment)))
			continue;
		if (SKIP_SUFFIXES.some((suffix) => relPath.endsWith(suffix))) continue;
		const content = await readFile(file, 'utf8').catch(() => '');
		if (content.length === 0) continue;
		matches.push(...collectBoundaryMatches(content, file, relPath));
	}
	const classified = applyBoundaryExceptions(matches, undefined, now);
	return {
		scannedFiles: files.length,
		matches,
		allowed: classified.allowed,
		violations: classified.violations,
		expired: classified.expired,
	};
};

export const formatReport = (
	result: Pick<
		ICoreProposalsBoundaryScanResult,
		'scannedFiles' | 'allowed' | 'violations' | 'expired'
	>,
): string => {
	if (result.violations.length === 0) {
		return (
			`core-proposals-boundary: ok. ` +
			`${result.scannedFiles} file(s) scanned; ` +
			`${result.allowed.length} explicit exception(s) active; ` +
			`${result.expired.length} expired.\n`
		);
	}
	const lines: string[] = [
		`core-proposals-boundary: ${result.violations.length} violation(s); ${result.allowed.length} explicit exception(s) active; ${result.expired.length} expired.`,
		'',
	];
	for (const violation of result.violations) {
		lines.push(
			`  ${violation.relPath}:${violation.line} [${violation.kind}] ${violation.code}`,
		);
		lines.push(`    token: ${violation.token}`);
		lines.push(`    snippet: ${JSON.stringify(violation.snippet)}`);
		if (violation.exception !== undefined) {
			lines.push(
				`    exception until ${violation.exception.until} (${violation.exception.classification}): ${violation.exception.reason}`,
			);
		} else {
			lines.push(
				'    Add a time-boxed exception with until + reason only if the coupling is still intentional and reviewable.',
			);
		}
	}
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const result = await scanCoreProposalsBoundaryLint();
	const report = formatReport(result);
	if (result.violations.length === 0) {
		process.stdout.write(report);
		return 0;
	}
	process.stderr.write(report);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
