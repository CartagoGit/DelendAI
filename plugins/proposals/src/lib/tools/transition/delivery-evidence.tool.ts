import { projectBranches } from '@delendai/core/public';
import {
	extractYamlBlock,
	parseFrontmatterBlock,
} from '../../proposals/frontmatter-parser';
import { createGitRunner, type IGitRunner } from '../../shared/git-runner';
import { resolveIntegrationCertificationEvidence } from '../../services/integration-certification-evidence.service';
import { guardShippedInPresent } from '../../services/proposal-state';
import type { IValidateEvidence } from '../../services/transition-evidence';
import {
	conflictOutcome,
	invalidTransitionOutcome,
	lifecycleEntity,
	unknownOutcome,
} from '../../services/lifecycle-outcome';

/** The text of one slice: from its heading to the next heading. */
export const sliceBlockOf = (markdown: string, sliceId: string): string => {
	const start = markdown.search(
		new RegExp(
			`^### ${sliceId.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s+—`,
			'mu',
		),
	);
	if (start === -1) return '';
	const rest = markdown.slice(start + 1);
	const end = rest.search(/^#{2,3} /mu);
	return end === -1
		? markdown.slice(start)
		: markdown.slice(start, start + 1 + end);
};

export const buildCodeError = (
	code: string,
	reason: string,
	nextAction?: string,
	fix?: string,
	entity = lifecycleEntity({
		id: 'unknown',
		entity: 'proposal',
	}),
) => {
	const lifecycle =
		code === 'QUARANTINED'
			? { kind: 'quarantined' as const, entity, reason, code }
			: code === 'INVALID_TRANSITION' || code === 'illegal-transition'
				? invalidTransitionOutcome({ entity, reason })
				: code.includes('conflict')
					? conflictOutcome({ entity, reason, code })
					: unknownOutcome({ entity, reason, code });
	const envelope: {
		ok: false;
		kind: string;
		entity: ReturnType<typeof lifecycleEntity>;
		reason: string;
		code?: string;
		currentStatus?: string;
		nextHops?: readonly string[];
		error: {
			code: string;
			reason: string;
			nextAction?: string;
			fix?: string;
		};
	} = {
		ok: false as const,
		kind: lifecycle.kind,
		entity: lifecycle.entity,
		reason,
		...(lifecycle.code !== undefined ? { code: lifecycle.code } : {}),
		...(lifecycle.currentStatus !== undefined
			? { currentStatus: lifecycle.currentStatus }
			: {}),
		...(lifecycle.nextHops !== undefined
			? { nextHops: lifecycle.nextHops }
			: {}),
		error: {
			code,
			reason,
		},
	};
	if (nextAction !== undefined) envelope.error.nextAction = nextAction;
	if (fix !== undefined) envelope.error.fix = fix;
	return {
		content: [
			{
				type: 'text' as const,
				text: JSON.stringify(envelope),
			},
		],
		structuredContent: envelope,
		isError: true,
	};
};

export const appendWarning = (
	current: string | undefined,
	next: string,
): string => (current === undefined ? next : `${current}; ${next}`);

export const isTrackedFile = async (
	gitRunner: IGitRunner,
	filePath: string,
): Promise<boolean> =>
	(await gitRunner(['ls-files', '--error-unmatch', filePath])).ok;

const readProposalCiEvidenceCommit = (raw: string): string | null => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return null;
	const match = yamlBlock.match(/^\s+commit:\s*"?([^"\n]+)"?\s*$/mu);
	return match?.[1]?.trim() || null;
};

export const hasProposalCiEvidence = (raw: string): boolean => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return false;
	if (readProposalCiEvidenceCommit(raw) === null) return false;
	return /^evidence:\s*$[\s\S]*?^\s+ci-runs:\s*$[\s\S]*?^\s+-\s+name:\s*.+$[\s\S]*?^\s+status:\s*.+$/mu.test(
		yamlBlock,
	);
};

export const hasExactCiCommitEvidence = (raw: string): boolean => {
	const currentSha = process.env.GITHUB_SHA?.trim();
	if (currentSha === undefined || currentSha === '') return false;
	return readProposalCiEvidenceCommit(raw) === currentSha;
};

/** Certification evidence for the commits the proposal shipped in. */
export const certifiedDelivery = async (
	raw: string,
	workspaceRoot: string,
	gitRunner: IGitRunner | undefined,
): Promise<IValidateEvidence | null> => {
	const yamlBlock = extractYamlBlock(raw);
	if (yamlBlock === null) return null;
	const shipped = guardShippedInPresent(
		parseFrontmatterBlock(yamlBlock) as Record<string, unknown>,
	);
	if (!shipped.ok) return null;
	const git = gitRunner ?? createGitRunner(workspaceRoot);
	// The same ref the owner machine certifies: the remote-tracking tip.
	const integration = (await projectBranches(workspaceRoot)).integration;
	const tip = await git([
		'rev-parse',
		'--verify',
		'--quiet',
		`refs/remotes/origin/${integration}`,
	]);
	return resolveIntegrationCertificationEvidence({
		workspaceRoot,
		shas: shipped.shas,
		git,
		integrationTip: tip.ok ? tip.output.trim() || undefined : undefined,
	});
};
