/**
 * reconcile-startup.ts — the boot sequence itself: mutex, detect, open,
 * fetch, rebuild, mirror, replay, prove, reap, verify, judge.
 *
 * WHY the order is fixed and explicit: each phase consumes what the
 * previous one established. Refs cannot be attributed before the schema
 * is current; a merge cannot be proven before the integration branch has
 * been fetched; a lease cannot be reaped before the work it owns is known
 * to exist. Writing the sequence out — rather than letting each subsystem
 * lazily reconcile itself on first use — is what makes "the server is
 * READY" a statement about the whole workspace instead of about whichever
 * component happened to be touched first.
 *
 * WHY READY is computed here and nowhere else: a blocker anywhere in the
 * run forbids it. There is no parameter, no flag and no phase-level
 * override that produces "READY with a warning", because the entire point
 * of the exercise is that a machine which silently starts half-repaired
 * is worse than one that says what is wrong and asks for the specific
 * work to be done.
 */

import { buildReconciliationReport as finish } from './build-report';
import type {
	IStartupPhaseResult,
	IStartupReconciliationReport,
} from './contracts';
import {
	computeFingerprint,
	decideMode,
	fingerprintPayload,
	policyDigest,
	readPreviousRun,
} from './fingerprint';
import { finding } from './finding-catalog';
import { runEnvironmentPhase } from './phases/detect-environment';
import { runFetchPhase } from './phases/fetch-refs';
import { runForgePhase } from './phases/reconcile-forge';
import { runGovernancePhase } from './phases/inspect-governance';
import { runIntegrationEvidencePhase } from './phases/integration-evidence';
import { runJournalPhase } from './phases/import-journal';
import { runLeasePhase } from './phases/reap-leases';
import { runStateDatabasePhase } from './phases/open-state';
import { runCheckoutPhase } from './phases/verify-checkout';
import { runWorkRefPhase } from './phases/rebuild-work-units';
import { compileWorkRefParser } from './work-ref-identity';

import type { IReconcileStartupInput } from './reconcile-startup.interface';

export type { IReconcileStartupInput } from './reconcile-startup.interface';

const collect = (
	phases: IStartupPhaseResult[],
	result: IStartupPhaseResult,
): void => {
	phases.push(result);
};

/**
 * Reconcile the workspace and decide whether the server may declare
 * READY. Never throws for an expected condition: a missing database, an
 * offline forge, a moved HEAD and a corrupt file all come back as a
 * report.
 */
export const reconcileStartup = async (
	input: IReconcileStartupInput,
): Promise<IStartupReconciliationReport> => {
	const startedAt = input.clock.now();
	const phases: IStartupPhaseResult[] = [];
	const allowCreate = input.allowCreate ?? true;

	const lock = await input.mutex.acquire();
	if (lock.kind === 'busy') {
		collect(phases, {
			phase: 'mutex',
			ran: true,
			counters: {},
			findings: [
				finding({
					code: 'mutex.busy',
					phase: 'mutex',
					kind: 'blocker',
					subject: lock.holder,
					message: `Another startup reconciliation is already running (${lock.holder}); this boot did not reconcile in parallel.`,
				}),
			],
		});
		return finish({
			phases,
			startedAt,
			completedAt: input.clock.now(),
			machineId: 'unknown',
			mode: 'skipped',
			fingerprint: '',
		});
	}
	collect(phases, {
		phase: 'mutex',
		ran: true,
		counters: {},
		findings: [],
	});

	try {
		return await reconcileUnderLock({
			input,
			phases,
			startedAt,
			allowCreate,
		});
	} finally {
		await lock.release();
	}
};

const reconcileUnderLock = async (args: {
	readonly input: IReconcileStartupInput;
	readonly phases: IStartupPhaseResult[];
	readonly startedAt: number;
	readonly allowCreate: boolean;
}): Promise<IStartupReconciliationReport> => {
	const { input, phases, startedAt } = args;
	const { policy } = input;

	const environment = await runEnvironmentPhase({
		seam: input.environmentSeam,
		policy,
	});
	collect(phases, {
		phase: 'environment',
		ran: true,
		counters: {},
		findings: environment.findings,
	});
	const repository = environment.environment.repository;
	if (!environment.ok || repository === undefined) {
		return finish({
			phases,
			startedAt,
			completedAt: input.clock.now(),
			machineId: environment.environment.machineId,
			mode: 'skipped',
			fingerprint: '',
		});
	}

	const now = input.clock.now();
	const state = runStateDatabasePhase({
		database: input.database,
		environment: environment.environment,
		repository,
		integrationBranch: policy.branches.integration,
		releaseBranch: policy.branches.release,
		allowCreate: args.allowCreate,
		now,
	});
	collect(phases, {
		phase: 'state-database',
		ran: true,
		counters: state.counters,
		findings: state.findings,
	});
	const ports = state.ports;
	if (!state.ok || ports === undefined || state.repositoryId === undefined) {
		return finish({
			phases,
			startedAt,
			completedAt: input.clock.now(),
			machineId: environment.environment.machineId,
			mode: 'skipped',
			fingerprint: '',
		});
	}
	const repositoryId = state.repositoryId;
	const repositoryUid = `${repository.forge}:${repository.owner}/${repository.name}`;

	const digestOfPolicy = policyDigest(policy);
	const previous = readPreviousRun(
		ports.journal,
		environment.environment.machineId,
	);
	const mode = decideMode(previous, {
		schemaVersion: state.schemaVersion,
		policyDigest: digestOfPolicy,
	});

	const run = ports.reconciliation.start({
		machineId: environment.environment.machineId,
		repositoryId,
		startedAt,
	});

	const fetched = await runFetchPhase({
		git: input.git,
		integrationBranch: policy.branches.integration,
		workRefPrefix: policy.branches.workRefPrefix,
	});
	collect(phases, {
		phase: 'fetch',
		ran: true,
		counters: fetched.counters,
		findings: fetched.findings,
	});

	const parser = compileWorkRefParser(
		policy.branches.workRefTemplate,
		policy.branches.workRefPrefix,
	);
	const work = await runWorkRefPhase({
		ports,
		git: input.git,
		parser,
		refs: fetched.refs,
		repository,
		repositoryId,
		integrationRef: fetched.integrationRef,
		integrationSha: fetched.integrationSha,
		agentId: environment.environment.agentId,
		machineId: environment.environment.machineId,
		mode,
		previousRefs: previous?.refs ?? {},
		now,
	});
	collect(phases, {
		phase: 'work-refs',
		ran: true,
		counters: work.counters,
		findings: work.findings,
	});

	const forge = await runForgePhase({
		forge: input.forge,
		ports,
		repositoryId,
		rebuilt: work.rebuilt,
		previousEtag: previous?.forgeEtag ?? '',
		machineId: environment.environment.machineId,
		now,
	});
	collect(phases, {
		phase: 'forge',
		ran: input.forge !== undefined,
		counters: forge.counters,
		findings: forge.findings,
	});

	const newestKnownEvent = ports.journal
		.listAll()
		.reduce((max, event) => Math.max(max, event.occurredAt), 0);
	const journal = await runJournalPhase({
		source: input.journalSource,
		ports,
		mode,
		since: newestKnownEvent > 0 ? newestKnownEvent : undefined,
	});
	collect(phases, {
		phase: 'journal',
		ran: input.journalSource !== undefined,
		counters: journal.counters,
		findings: journal.findings,
	});

	const evidence = await runIntegrationEvidencePhase({
		ports,
		git: input.git,
		repositoryId,
		integrationSha: fetched.integrationSha,
		liveRefs: new Set(fetched.refs.map((ref) => ref.name)),
		now,
	});
	collect(phases, {
		phase: 'integration-evidence',
		ran: true,
		counters: evidence.counters,
		findings: evidence.findings,
	});

	const leases = runLeasePhase({
		ports,
		policy,
		repositoryId,
		repositoryUid,
		machineId: environment.environment.machineId,
		agentId: environment.environment.agentId,
		now,
	});
	collect(phases, {
		phase: 'leases',
		ran: policy.coordination.strategy !== 'none',
		counters: leases.counters,
		findings: leases.findings,
	});

	const checkout = await runCheckoutPhase({
		git: input.git,
		policy,
		refs: fetched.refs,
	});
	collect(phases, {
		phase: 'checkout',
		ran: true,
		counters: {},
		findings: checkout.findings,
	});

	const governance = await runGovernancePhase({
		seam: input.governance,
		policy,
		repository,
	});
	collect(phases, {
		phase: 'governance',
		ran: policy.governance.strategy !== 'none',
		counters: {},
		findings: governance.findings,
	});

	const fingerprint = computeFingerprint({
		schemaVersion: state.schemaVersion,
		policyDigest: digestOfPolicy,
		integrationSha: fetched.integrationSha,
		forgeEtag: forge.etag,
		refs: fetched.refs,
	});
	const report = finish({
		phases,
		startedAt,
		completedAt: input.clock.now(),
		machineId: environment.environment.machineId,
		mode,
		fingerprint,
	});

	// The fingerprint is written only when it MOVED. A boot that changed
	// nothing appends nothing, so "start the server twenty times" does not
	// grow the journal by twenty events.
	if (previous?.digest !== fingerprint) {
		ports.journal.append({
			eventKind: 'reconciliation-outcome',
			repositoryUid,
			actorAgentId: environment.environment.agentId,
			machineId: environment.environment.machineId,
			occurredAt: now,
			payload: fingerprintPayload({
				digest: fingerprint,
				schemaVersion: state.schemaVersion,
				policyDigest: digestOfPolicy,
				integrationSha: fetched.integrationSha,
				forgeEtag: forge.etag,
				refs: fetched.refs,
			}),
		});
	}

	ports.reconciliation.complete({
		id: run.id,
		status: report.status === 'READY' ? 'ok' : 'degraded',
		completedAt: report.completedAt,
		refsDiscovered: fetched.refs.length,
		workUnitsRepaired: report.counters.workUnitsRebuilt,
		generationsRepaired: report.counters.generationsRecorded,
		claimsReleased: report.counters.claimsReleased,
		anomalies: report.blockers,
	});

	return report;
};
