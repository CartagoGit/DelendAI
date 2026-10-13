/**
 * provenance.spec.ts — the end-to-end chain, read back in one query.
 *
 * Builds one integrated generation the long way (repository → agent →
 * machine → work unit → checkpoint → PR → CI → merge) and then asserts
 * that a SINGLE provenance read returns every link. If this spec ever
 * needs a second query to answer "where did this commit come from",
 * the model has lost the property it exists for.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CoordinationJournalRepo } from '../../../../src/lib/work-model/journal-repo';
import { ForgeRepo } from '../../../../src/lib/work-model/forge-repo';
import { GenerationsRepo } from '../../../../src/lib/work-model/generations-repo';
import { readGenerationProvenance } from '../../../../src/lib/work-model/provenance';
import { WorkUnitsRepo } from '../../../../src/lib/work-model/work-units-repo';
import {
	makeFixture,
	ProposalsSqliteDriver,
	seedIdentity,
	TEST_REPOSITORY,
	type IWorkModelFixture,
} from './fixture';

describe('work model provenance', () => {
	let fixture: IWorkModelFixture;
	let driver: ProposalsSqliteDriver;

	beforeEach(() => {
		fixture = makeFixture('provenance');
		driver = new ProposalsSqliteDriver({ path: fixture.dbPath });
	});

	afterEach(() => {
		driver.close();
		fixture.dispose();
	});

	it('reads proposal → slice → generation → agent → machine → PR → CI → merge', () => {
		const identity = seedIdentity(driver);
		const workUnits = new WorkUnitsRepo(driver.handle);
		const unit = workUnits.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s1',
			createdByAgentId: identity.agentId,
			now: 1_000,
		});

		const generations = new GenerationsRepo(driver.handle);
		generations.record({
			workUnitId: unit.id,
			generation: 1,
			baseIntegrationSha: 'base0001',
			wipRef: 'refs/wip/agent-1/f00777/s1',
			wipHeadSha: 'wip0001',
			patchDigest: 'patch0001',
			fileScope: ['src/a.ts', 'src/b.ts'],
			checkpointKind: 'merge-candidate',
			candidateState: 'proposed',
			validationState: 'pending',
			authorAgentId: identity.agentId,
			machineId: identity.machineId,
			now: 2_000,
		});
		workUnits.advanceGeneration(unit.uid, 1, 2_000);

		const forge = new ForgeRepo(driver.handle);
		const pr = forge.upsertPullRequest({
			repositoryId: identity.repositoryId,
			number: 42,
			headRef: 'refs/wip/agent-1/f00777/s1',
			baseRef: 'develop',
			headSha: 'wip0001',
			state: 'open',
			now: 3_000,
		});
		generations.attachPullRequest({
			workUnitId: unit.id,
			generation: 1,
			pullRequestId: pr.id,
			now: 3_000,
		});
		forge.upsertCiRun({
			repositoryId: identity.repositoryId,
			candidateSha: 'merged001',
			workflow: 'ci',
			checkName: 'tests',
			state: 'success',
			startedAt: 3_100,
			completedAt: 3_200,
			now: 3_200,
		});
		generations.recordValidation({
			workUnitId: unit.id,
			generation: 1,
			validationState: 'green',
			ciResult: 'success',
			now: 3_300,
		});
		const integration = generations.markIntegrated({
			workUnitId: unit.id,
			generation: 1,
			integratedSha: 'merged001',
			now: 4_000,
		});
		expect(integration.first).toBe(true);
		forge.upsertPullRequest({
			repositoryId: identity.repositoryId,
			number: 42,
			headRef: 'refs/wip/agent-1/f00777/s1',
			baseRef: 'develop',
			headSha: 'wip0001',
			state: 'merged',
			mergeSha: 'merged001',
			now: 4_000,
		});
		new CoordinationJournalRepo(driver.handle).append({
			eventKind: 'semantic-checkpoint',
			workUnitUid: unit.uid,
			generation: 1,
			actorAgentId: identity.agentId,
			occurredAt: 2_000,
			payload: { boundary: 'slice complete' },
		});

		const chain = readGenerationProvenance(driver.handle, unit.uid, 1);

		expect(chain).not.toBeNull();
		expect(chain?.repository.uid).toBe('github:acme/widgets');
		expect(chain?.repository.integrationBranch).toBe('develop');
		expect(chain?.proposalUid).toBe('f00777');
		expect(chain?.sliceUid).toBe('f00777-s1');
		expect(chain?.generation).toBe(1);
		expect(chain?.agent.id).toBe('agent-1');
		expect(chain?.agent.host).toBe('claude-code');
		expect(chain?.machine.hostname).toBe('alpha.local');
		expect(chain?.createdByAgentId).toBe('agent-1');
		expect(chain?.fileScope).toEqual(['src/a.ts', 'src/b.ts']);
		expect(chain?.baseIntegrationSha).toBe('base0001');
		expect(chain?.wipHeadSha).toBe('wip0001');
		expect(chain?.pullRequest?.number).toBe(42);
		expect(chain?.validationState).toBe('green');
		expect(chain?.ciResult).toBe('success');
		expect(chain?.integratedSha).toBe('merged001');
		expect(chain?.ciRuns.map((run) => run.checkName)).toEqual(['tests']);
		expect(chain?.journal.map((event) => event.eventKind)).toEqual([
			'semantic-checkpoint',
		]);
	});

	it('recovers createdBy and previous owners after handoffs', () => {
		const identity = seedIdentity(driver);
		const workUnits = new WorkUnitsRepo(driver.handle);
		const unit = workUnits.ensure({
			repositoryId: identity.repositoryId,
			repository: TEST_REPOSITORY,
			proposalUid: 'f00777',
			sliceUid: 'f00777-s2',
			createdByAgentId: identity.agentId,
			now: 1_000,
		});
		driver.handle
			.prepare(
				`INSERT INTO agents (id, host, model, machine_id, state, first_seen, last_seen)
				 VALUES ('agent-2', 'codex', NULL, ?, 'working', 1, 1)`,
			)
			.run(identity.machineId);
		workUnits.changeOwner({
			uid: unit.uid,
			agentId: 'agent-2',
			reason: 'recovered',
			now: 5_000,
		});

		const after = workUnits.getByUid(unit.uid);
		expect(after?.createdByAgentId).toBe('agent-1');
		expect(after?.currentOwnerAgentId).toBe('agent-2');
		expect(workUnits.previousOwners(unit.uid)).toEqual(['agent-1']);
		expect(
			workUnits.ownershipHistory(unit.uid).map((entry) => entry.reason),
		).toEqual(['created', 'recovered']);
	});

	it('returns null for a checkpoint this database has not rebuilt yet', () => {
		expect(
			readGenerationProvenance(driver.handle, 'unknown-unit', 1),
		).toBeNull();
	});
});
