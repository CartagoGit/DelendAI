/**
 * fixture.ts — a real, on-disk work-model database for the specs.
 *
 * WHY a temp FILE and not `:memory:` by default: the concurrency spec
 * needs several OS processes to open the SAME database, which an
 * in-memory database cannot express. Using one fixture for every spec
 * keeps the tests honest about what they exercise — migrations, WAL,
 * busy_timeout and real constraints, not a mock.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ProposalsSqliteDriver } from '../../../../src/lib/sqlite-driver';
import { WorkRegistryRepo } from '../../../../src/lib/work-model/registry-repo';

export interface IWorkModelFixture {
	readonly dir: string;
	readonly dbPath: string;
	readonly dispose: () => void;
}

export const makeFixture = (label: string): IWorkModelFixture => {
	const dir = mkdtempSync(join(tmpdir(), `work-model-${label}-`));
	return {
		dir,
		dbPath: join(dir, 'proposals.sqlite'),
		dispose: () => rmSync(dir, { recursive: true, force: true }),
	};
};

export const TEST_REPOSITORY = {
	forge: 'github',
	owner: 'acme',
	name: 'widgets',
} as const;

/** Registers the identity rows every other table references. */
export const seedIdentity = (
	driver: ProposalsSqliteDriver,
	now = 1_000,
): {
	readonly repositoryId: number;
	readonly agentId: string;
	readonly machineId: string;
} => {
	const registry = new WorkRegistryRepo(driver.handle);
	const machine = registry.registerMachine({
		machineId: 'machine-alpha',
		hostname: 'alpha.local',
		platform: 'linux',
		now,
	});
	const agent = registry.registerAgent({
		id: 'agent-1',
		host: 'claude-code',
		model: 'opus',
		machineId: machine.machineId,
		state: 'working',
		now,
	});
	const repository = registry.registerRepository({
		...TEST_REPOSITORY,
		integrationBranch: 'develop',
		releaseBranch: 'main',
		now,
	});
	return {
		repositoryId: repository.id,
		agentId: agent.id,
		machineId: machine.machineId,
	};
};

export { ProposalsSqliteDriver };
