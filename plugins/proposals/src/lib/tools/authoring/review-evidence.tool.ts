import { SafeWorkspaceReader } from '@delendai/core/runtime';
import { toolError, type IToolTextResult } from '@delendai/core/public';
import type { IGitRunner } from '../../shared/git-runner';
import {
	commitIsIntegrated,
	supersedingDelivery,
	recordedRun,
} from '../../services/review-verdict-evidence';
import { appendPeerReviewJsonl } from '../../shared/peer-review-log';
import type { IRecordedRun } from '../../contracts/interfaces/recorded-run.interface';
import type {
	IToolErrorCarryingError,
	IProposalReviewEvidence,
	IPeerReviewPersistedEntry,
} from '../../contracts/interfaces/authoring-tool.interface';
import { REVIEW_EVIDENCE_SCHEMA } from '../../contracts/constants/review-tool-schema.constant';

export const isToolErrorCarryingError = (
	value: unknown,
): value is IToolErrorCarryingError => value instanceof Error;

const toApproveEvidenceError = (reason: string): IToolTextResult =>
	toolError(`approve requires empirical evidence: ${reason}`);

export const requireProposalReviewEvidence = (
	evidence: IProposalReviewEvidence | undefined,
	acceptanceCriteria: readonly string[] = [],
): IToolTextResult | null => {
	if (evidence === undefined) {
		return toApproveEvidenceError(
			'provide evidence.commitHash, evidence.validateExitCode=0, evidence.testsPassing>=1, and evidence.testsTotal>=1',
		);
	}
	const parsed = REVIEW_EVIDENCE_SCHEMA.safeParse(evidence);
	if (!parsed.success) {
		return toApproveEvidenceError(
			parsed.error.issues[0]?.message ?? 'invalid evidence payload',
		);
	}
	if (acceptanceCriteria.length === 0) return null;
	const covered = new Map(
		(parsed.data.acceptanceCriteria ?? []).map((entry) => [
			entry.criterion.trim(),
			entry.evidence.trim(),
		]),
	);
	const missing = acceptanceCriteria.filter(
		(criterion) => covered.get(criterion.trim()) === undefined,
	);
	if (missing.length > 0) {
		return toApproveEvidenceError(
			`evidence.acceptanceCriteria must cover every declared criterion; missing: ${missing.join(' | ')}`,
		);
	}
	return null;
};

/** An approval of a commit the integration branch does not have. */
export const unintegratedEvidenceError = async (
	run: IGitRunner,
	integration: string | undefined,
	commit: string | undefined,
): Promise<IToolTextResult | null> => {
	if (integration === undefined || commit === undefined) return null;
	return (await commitIsIntegrated(run, integration, commit)) !== false
		? null
		: toApproveEvidenceError(
				`evidence.commitHash ${commit} is not on ${integration}: approve what landed, not a commit of a branch that may still change`,
			);
};

/** Where the checkout's test journal records each run. */
const TEST_RUN_JOURNAL = '.cache/delendai/results/logs/test-runs.jsonl';

/**
 * The run an approval cites, or why it cannot be cited: a run the journal
 * does not hold, or one that failed. No `runId` cites nothing, and the note
 * then says the counts were claimed.
 */
export const citedRunOf = async (
	workspaceRoot: string,
	runId: string | undefined,
): Promise<{
	readonly run?: IRecordedRun;
	readonly error?: IToolTextResult;
}> => {
	if (runId === undefined) return {};
	let journal = '';
	try {
		journal = (
			await new SafeWorkspaceReader(workspaceRoot).readText(
				TEST_RUN_JOURNAL,
			)
		).content;
	} catch {
		// no journal: the run is not recorded
	}
	const run = recordedRun(journal, runId);
	if (run === undefined)
		return {
			error: toApproveEvidenceError(
				`evidence.runId ${runId} is not in ${TEST_RUN_JOURNAL} of this checkout: cite a run the journal recorded, or leave runId out and the note says the counts were claimed`,
			),
		};
	if (run.result !== 'pass')
		return {
			error: toApproveEvidenceError(
				`evidence.runId ${runId} failed (\`${run.command}\`): approve on a passing run`,
			),
		};
	return { run };
};

/** Hex characters of a delivery a person can still tell apart. */
const SHORT_DELIVERY = 12;

/** An approval of a delivery the same proposal has since replaced. */
export const supersededEvidenceError = async (
	run: IGitRunner,
	integration: string | undefined,
	proposalId: string,
	files: readonly string[],
	commit: string | undefined,
): Promise<IToolTextResult | null> => {
	if (integration === undefined || commit === undefined) return null;
	const newer = await supersedingDelivery(
		run,
		integration,
		proposalId,
		files,
		commit,
	);
	return newer === undefined
		? null
		: toApproveEvidenceError(
				`evidence.commitHash ${commit} is not the slice as it stands: ${proposalId} was delivered again by ${newer.slice(0, SHORT_DELIVERY)}, which changed the same files. Read that one and approve it`,
			);
};

export const appendPeerReviewLog = async (
	logPathAbs: string,
	entry: IPeerReviewPersistedEntry,
): Promise<void> => appendPeerReviewJsonl(logPathAbs, entry);
