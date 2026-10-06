import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { resolveProposalsDbPaths } from '@delendai/proposals-sqlite';
import { createFakeToolServer } from '@delendai/test-kit/public';
import { afterEach, describe, expect, it } from 'vitest';

import {
	recordProposalIndexRead,
	resetProposalIndexReadStats,
} from '../../../../src/lib/proposals/index-read-stats';
import type {
	IDbDoctorOptions,
	IDbDoctorResult,
} from '../../../../src/lib/services/db-doctor';
import {
	buildDbDoctorToolRegistration,
	dbDoctorDatabaseExists,
	dbDoctorOutputSchema,
	DEFAULT_DOCTOR_CHECKS,
	runDbDoctorTool,
} from '../../../../src/lib/tools/db-doctor.tool';

const roots: string[] = [];

afterEach(() => {
	resetProposalIndexReadStats();
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

const makeRoot = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'db-doctor-tool-'));
	roots.push(root);
	return root;
};

const fakeRunner = (healthy: boolean) => {
	const calls: IDbDoctorOptions[] = [];
	const run = (options: IDbDoctorOptions): IDbDoctorResult => {
		calls.push(options);
		return {
			checks: [
				{
					name: 'integrity',
					severity: healthy ? 'ok' : 'error',
					message: healthy ? 'No issues detected.' : 'corrupt',
				},
			],
			healthy,
			checkedAt: 7,
		};
	};
	return { calls, run };
};

describe('runDbDoctorTool', () => {
	it('runs the SQL checks against the canonical path and appends storage_mode', () => {
		const root = makeRoot();
		const runner = fakeRunner(true);

		const result = runDbDoctorTool({
			workspaceRoot: root,
			env: { DELENDAI_PROPOSAL_INDEX_SOURCE: 'sql' },
			runDoctor: runner.run,
		});

		const databasePath = resolveProposalsDbPaths(root).databasePath;
		expect(runner.calls).toEqual([
			{
				workspaceRoot: root,
				sqlitePath: databasePath,
				checks: DEFAULT_DOCTOR_CHECKS,
			},
		]);
		expect(result.checks.map((check) => check.name)).toEqual([
			'integrity',
			'storage_mode',
		]);
		expect(result.checks[1]?.message).toBe(
			`mode=sql; canonical path=${databasePath}; fallbacks=0 of 0 read(s); parity=not-observed.`,
		);
		expect(result.healthy).toBe(true);
		expect(result.checkedAt).toBe(7);
		expect(() => dbDoctorOutputSchema.parse(result)).not.toThrow();
	});

	it('passes custom checks through and stays unhealthy when the SQL checks fail', () => {
		const runner = fakeRunner(false);
		const checks = [DEFAULT_DOCTOR_CHECKS[0]!];

		const result = runDbDoctorTool({
			workspaceRoot: makeRoot(),
			checks,
			runDoctor: runner.run,
		});

		expect(runner.calls[0]?.checks).toBe(checks);
		expect(result.checks.at(-1)?.severity).toBe('ok');
		expect(result.healthy).toBe(false);
	});

	it('turns a healthy SQL report unhealthy when this process fell back to JSON', () => {
		recordProposalIndexRead('fallback-unavailable');

		const result = runDbDoctorTool({
			workspaceRoot: makeRoot(),
			runDoctor: fakeRunner(true).run,
		});

		expect(result.checks.at(-1)?.severity).toBe('warning');
		expect(result.checks.at(-1)?.message).toContain('fallbacks=1 of 1');
		expect(result.healthy).toBe(false);
	});
});

describe('buildDbDoctorToolRegistration', () => {
	const register = async (namespacePrefix?: string) => {
		const registered: {
			name: string;
			handler: (args: unknown) => unknown;
		}[] = [];
		const registration = buildDbDoctorToolRegistration({
			workspaceRoot: makeRoot(),
			...(namespacePrefix === undefined ? {} : { namespacePrefix }),
			runDoctor: fakeRunner(true).run,
		});
		await registration.register(
			createFakeToolServer({
				onRegisterTool: ({ name, handler }) => {
					registered.push({ name, handler });
				},
			}),
		);
		return { registration, registered };
	};

	it('registers the read-only doctor under the default prefix and answers through the runner', async () => {
		const { registration, registered } = await register();

		expect(registration.id).toBe('proposals_db_doctor');
		expect(registered.map((tool) => tool.name)).toEqual([
			'proposals_proposals_db_doctor',
		]);
		const response = (await registered[0]!.handler({})) as {
			structuredContent?: unknown;
		};
		const output = dbDoctorOutputSchema.parse(response.structuredContent);
		expect(output.checks.map((check) => check.name)).toEqual([
			'integrity',
			'storage_mode',
		]);
	});

	it('uses the host namespace prefix when one is given', async () => {
		const { registered } = await register('work');

		expect(registered[0]?.name).toBe('work_proposals_db_doctor');
	});
});

describe('dbDoctorDatabaseExists', () => {
	it('is false until a file sits at the canonical database path', () => {
		const root = makeRoot();
		expect(dbDoctorDatabaseExists(root)).toBe(false);

		const databasePath = resolveProposalsDbPaths(root).databasePath;
		mkdirSync(dirname(databasePath), { recursive: true });
		writeFileSync(databasePath, '');

		expect(dbDoctorDatabaseExists(root)).toBe(true);
	});
});
