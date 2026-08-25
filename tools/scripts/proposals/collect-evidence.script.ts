#!/usr/bin/env bun
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { locateProposal } from '../../../plugins/proposals/src/lib/proposals/locate';
import { setFrontmatterBlockField } from '../../../plugins/proposals/src/lib/proposals/proposal-frontmatter-writer';

const execFileAsync = promisify(execFile);

const PROPOSALS_DIR_RELATIVE_PATH = 'docs/mcp-vertex/proposals';
const PROPOSALS_INDEX_RELATIVE_PATH = '.cache/mcp-vertex/proposals/index.json';

export interface ICiRunEvidence {
	readonly name: string;
	readonly status: 'success' | 'failure' | 'skipped';
	readonly runId: string;
	readonly logUrl?: string;
}

export interface IProposalEvidence {
	readonly proposalId: string;
	readonly commit: string;
	readonly collectedAt: string;
	readonly ciRuns: readonly ICiRunEvidence[];
}

interface IGhRunListItem {
	readonly name?: string;
	readonly workflowName?: string;
	readonly conclusion?: string | null;
	readonly status?: string | null;
	readonly databaseId?: number | string;
	readonly url?: string;
}

const quoteYaml = (value: string): string => JSON.stringify(value);

const normalizeRunStatus = (
	run: Pick<IGhRunListItem, 'conclusion' | 'status'>,
): ICiRunEvidence['status'] => {
	if (run.conclusion === 'success') return 'success';
	if (run.conclusion === 'failure') return 'failure';
	if (
		run.status === 'completed' &&
		run.conclusion &&
		run.conclusion !== 'success'
	) {
		return 'failure';
	}
	return 'skipped';
};

export const parseGitHubRunsJson = (raw: string): readonly ICiRunEvidence[] => {
	const parsed = JSON.parse(raw) as unknown;
	if (!Array.isArray(parsed)) return [];
	return parsed
		.filter(
			(entry): entry is IGhRunListItem =>
				entry !== null && typeof entry === 'object',
		)
		.map((run) => {
			const name =
				typeof run.workflowName === 'string' &&
				run.workflowName.trim() !== ''
					? run.workflowName.trim()
					: typeof run.name === 'string' && run.name.trim() !== ''
						? run.name.trim()
						: 'unknown';
			const runId =
				typeof run.databaseId === 'number' ||
				typeof run.databaseId === 'string'
					? String(run.databaseId)
					: 'unknown';
			return {
				name,
				status: normalizeRunStatus(run),
				runId,
				...(typeof run.url === 'string' && run.url.trim() !== ''
					? { logUrl: run.url.trim() }
					: {}),
			};
		});
};

export const serializeProposalEvidence = (
	evidence: IProposalEvidence,
): readonly string[] => {
	const lines = [
		`commit: ${quoteYaml(evidence.commit)}`,
		`collected-at: ${quoteYaml(evidence.collectedAt)}`,
		'ci-runs:',
	];
	for (const run of evidence.ciRuns) {
		lines.push(`  - name: ${quoteYaml(run.name)}`);
		lines.push(`    status: ${quoteYaml(run.status)}`);
		lines.push(`    runId: ${quoteYaml(run.runId)}`);
		if (run.logUrl) {
			lines.push(`    logUrl: ${quoteYaml(run.logUrl)}`);
		}
	}
	return lines;
};

export const collectProposalEvidence = async (
	proposalId: string,
	workspaceRoot = process.cwd(),
): Promise<IProposalEvidence> => {
	const root = resolve(workspaceRoot);
	const { stdout: commitStdout } = await execFileAsync(
		'git',
		['rev-parse', 'HEAD'],
		{ cwd: root },
	);
	const commit = commitStdout.trim();
	const { stdout: runsStdout } = await execFileAsync(
		'gh',
		[
			'run',
			'list',
			'--commit',
			commit,
			'--json',
			'name,workflowName,conclusion,status,databaseId,url',
			'--limit',
			'50',
		],
		{ cwd: root },
	);
	return {
		proposalId,
		commit,
		collectedAt: new Date().toISOString(),
		ciRuns: parseGitHubRunsJson(runsStdout),
	};
};

export const attachProposalEvidence = async (input: {
	readonly proposalId: string;
	readonly evidence: IProposalEvidence;
	readonly workspaceRoot?: string;
}): Promise<string> => {
	const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
	const proposalsDirAbs = join(workspaceRoot, PROPOSALS_DIR_RELATIVE_PATH);
	const indexPathAbs = join(workspaceRoot, PROPOSALS_INDEX_RELATIVE_PATH);
	const located = await locateProposal(input.proposalId, {
		indexPathAbs,
		proposalsDirAbs,
	});
	if (located === null) {
		throw new Error(
			`proposal ${input.proposalId} not found under ${PROPOSALS_DIR_RELATIVE_PATH}`,
		);
	}
	const current = await readFile(located.absPath, 'utf8');
	const updated = setFrontmatterBlockField(
		current,
		'evidence',
		serializeProposalEvidence(input.evidence),
	);
	await withFileMutex(located.absPath, async () => {
		await writeFileAtomic(located.absPath, updated);
	});
	return located.absPath;
};

const main = async (argv: readonly string[]): Promise<number> => {
	const proposalId = argv[0]?.trim();
	if (!proposalId) {
		console.error('usage: bun run collect-evidence <proposalId>');
		return 1;
	}
	try {
		const evidence = await collectProposalEvidence(proposalId);
		if (evidence.ciRuns.length === 0) {
			console.error(
				`collect-evidence: no workflow runs found for commit ${evidence.commit}`,
			);
			return 1;
		}
		const path = await attachProposalEvidence({
			proposalId,
			evidence,
		});
		console.log(
			`attached CI evidence for ${proposalId} (${evidence.ciRuns.length} runs) in ${path}`,
		);
		return 0;
	} catch (error: unknown) {
		console.error(
			`collect-evidence failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	}
};

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}
