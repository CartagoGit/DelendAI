/**
 * forge.ts — f00136 S2 / r00012 consumer: read-only GitHub pull-request +
 * CI visibility via the host's already-authenticated `gh` CLI. Parsers are
 * pure (unit-tested on real `gh --json` fixtures); the runner composes the
 * shared `runExternalTool` seam, so this file spawns nothing directly and
 * stays fully testable with an injected exec.
 *
 * Network-gated + opt-in by the caller (registered only under
 * `allowForge: true`) and credential-free: it inherits the user's `gh` auth,
 * never storing or reading a token itself.
 */
import { runExternalTool } from '@mcp-vertex/core/public';
import type { IArgvExec, IExternalTool } from '@mcp-vertex/core/public';

import type {
	IForgeList,
	IForgeView,
	IPullRequest,
	IPullRequestDetail,
} from '../contracts/interfaces/forge.interface';

const GH_TOOL: IExternalTool = {
	id: 'gh',
	bin: 'gh',
	installHints: [
		{ manager: 'brew', command: 'brew install gh' },
		{ manager: 'apt', command: 'sudo apt install gh' },
		{ manager: 'winget', command: 'winget install GitHub.cli' },
	],
};

const GH_ABSENT_NOTE =
	'gh (GitHub CLI) not found on PATH — install it (e.g. brew install gh) and run `gh auth login`';

const sliceJson = (
	raw: string,
	open: string,
	close: string,
): string | undefined => {
	const start = raw.indexOf(open);
	const end = raw.lastIndexOf(close);
	return start >= 0 && end >= start ? raw.slice(start, end + 1) : undefined;
};

/** Parse `gh pr list --json ...` output. Pure; tolerant; never throws. */
export const parsePrList = (raw: string): IPullRequest[] => {
	const json = sliceJson(raw, '[', ']');
	if (json === undefined) return [];
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	return (data as Record<string, unknown>[]).map((pr) => ({
		number: typeof pr.number === 'number' ? pr.number : 0,
		title: String(pr.title ?? ''),
		branch: String(pr.headRefName ?? ''),
		url: String(pr.url ?? ''),
		draft: pr.isDraft === true,
	}));
};

/** Parse `gh pr view --json ...` output (with statusCheckRollup). Pure. */
export const parsePrView = (raw: string): IPullRequestDetail | undefined => {
	const json = sliceJson(raw, '{', '}');
	if (json === undefined) return undefined;
	let data: Record<string, unknown>;
	try {
		data = JSON.parse(json) as Record<string, unknown>;
	} catch {
		return undefined;
	}
	if (data === null || typeof data !== 'object') return undefined;
	const rollup = Array.isArray(data.statusCheckRollup)
		? (data.statusCheckRollup as Record<string, unknown>[])
		: [];
	return {
		number: typeof data.number === 'number' ? data.number : 0,
		title: String(data.title ?? ''),
		state: String(data.state ?? ''),
		url: String(data.url ?? ''),
		mergeable: String(data.mergeable ?? ''),
		reviewDecision: String(data.reviewDecision ?? ''),
		checks: rollup.map((check) => ({
			name: String(check.name ?? check.context ?? ''),
			status: String(check.status ?? check.state ?? ''),
			conclusion: String(check.conclusion ?? ''),
			url: String(check.detailsUrl ?? check.targetUrl ?? ''),
		})),
	};
};

/** List open pull requests via `gh pr list`. Read-only; never throws. */
export const listOpenPrs = async (
	cwd: string,
	exec?: IArgvExec,
): Promise<IForgeList> => {
	const run = await runExternalTool(
		{
			tool: GH_TOOL,
			args: [
				'pr',
				'list',
				'--state',
				'open',
				'--limit',
				'50',
				'--json',
				'number,title,headRefName,url,isDraft',
			],
			cwd,
		},
		exec,
	);
	if (run.unavailable)
		return { available: false, note: GH_ABSENT_NOTE, prs: [] };
	if (!run.ok && !run.stdout.includes('[')) {
		return {
			available: true,
			note: run.stderr.trim() || 'gh pr list failed',
			prs: [],
		};
	}
	return { available: true, prs: parsePrList(run.stdout || run.stderr) };
};

/**
 * View a pull request (+ CI check rollup) via `gh pr view`. `ref` may be a
 * PR number, branch, or url; omit it to use the current branch's PR.
 * Read-only; never throws.
 */
export const viewPr = async (
	cwd: string,
	ref?: string,
	exec?: IArgvExec,
): Promise<IForgeView> => {
	const run = await runExternalTool(
		{
			tool: GH_TOOL,
			args: [
				'pr',
				'view',
				...(ref !== undefined && ref !== '' ? [ref] : []),
				'--json',
				'number,title,state,url,mergeable,reviewDecision,statusCheckRollup',
			],
			cwd,
		},
		exec,
	);
	if (run.unavailable) return { available: false, note: GH_ABSENT_NOTE };
	if (!run.ok && !run.stdout.includes('{')) {
		return {
			available: true,
			note:
				run.stderr.trim() ||
				`no pull request found for "${ref ?? 'current branch'}"`,
		};
	}
	const pr = parsePrView(run.stdout || run.stderr);
	return pr === undefined
		? { available: true, note: 'could not parse gh output' }
		: { available: true, pr };
};
