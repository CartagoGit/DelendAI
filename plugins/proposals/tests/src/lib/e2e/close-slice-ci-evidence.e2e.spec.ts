import { execFileSync } from 'node:child_process';
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createQualityServer,
	findProposalPath,
	seedSlice,
	syncProposals,
	workspaces,
} from './quality-close-slice.harness';

const CHECK_ROW = (conclusion: string): string =>
	`delendai-validate\\tcompleted\\t${conclusion}\\thttps://ci/1`;

/** A `gh` that reports the required check with the given conclusion. */
const fakeGh = (conclusion: string): string => {
	const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
	workspaces.push(bin);
	writeFileSync(
		join(bin, 'gh'),
		`#!/bin/sh\ncase "$1" in\n  --version) echo gh;;\n  pr) ;;\n  api) printf "${CHECK_ROW(conclusion)}\\n";;\nesac\n`,
	);
	chmodSync(join(bin, 'gh'), 0o755);
	return bin;
};

const originalPath = process.env.PATH;

afterEach(() => {
	process.env.PATH = originalPath;
	for (const dir of workspaces.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

/** A server whose gate would fail if it ran (or declares none), over a committed `type`-gated slice. */
const typeGatedSlice = async (conclusion: string, declaresGate = true) => {
	const { workspace, client, project } = await createQualityServer('true', {
		validate: 'exit 1',
		development: {
			profile: 'shared-checkout-pr',
			branches: { integration: 'main', namespacePrefix: 'delendai' },
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});
	process.env.PATH = `${fakeGh(conclusion)}:${originalPath ?? ''}`;
	if (!declaresGate)
		writeFileSync(
			join(workspace, 'package.json'),
			JSON.stringify({ name: 'fixture', private: true }),
		);
	const proposalPath = seedSlice(workspace, 'f04204');
	writeFileSync(
		proposalPath,
		readFileSync(proposalPath, 'utf8').replace(
			'**Gate**: none',
			'**Gate**: type',
		),
	);
	expect((await syncProposals(client)).isError).toBeFalsy();
	const claim = await client.callTool({
		name: 'delendai_proposals_agent_lock',
		arguments: {
			action: 'claim',
			task_id: 'f04204-S1',
			agent: 'agent-quality-e2e',
			files: ['src/quality.ts'],
		},
	});
	expect(claim.isError).toBeFalsy();
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: workspace });
	git('config', 'user.email', 'e2e@example.com');
	git('config', 'user.name', 'E2E');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(workspace, '.gitignore'), '.cache/\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'work');
	const close = (extra: object = {}) =>
		client.callTool({
			name: 'delendai_proposals_close_slice',
			arguments: { proposalId: 'f04204', sliceId: 'S1', ...extra },
		});
	return { workspace, client, project, close };
};

describe('e2e: a type-gated slice closes from the evidence the tree already has', () => {
	it('closes from CI certification of the exact tree, with no force and no local gate', async () => {
		const { workspace, client, project, close } =
			await typeGatedSlice('success');
		try {
			const closed = await close();
			expect(closed.structuredContent).toMatchObject({
				ok: true,
				closed: true,
				gate: { state: 'pass', certifiedBy: 'forge-check' },
			});
			expect(
				readFileSync(findProposalPath(workspace, 'f04204'), 'utf8'),
			).toMatch(/\*\*Status\*\*:\s*done/i);
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('refuses a tree CI never saw, and never steers toward force', async () => {
		const { workspace, client, project, close } = await typeGatedSlice(
			'success',
			false,
		);
		try {
			writeFileSync(join(workspace, 'edited.txt'), 'x');
			const refused = await close();
			expect(refused.isError).toBe(true);
			expect(refused.structuredContent).toMatchObject({
				ok: false,
				closed: false,
			});
			const text = JSON.stringify(refused.structuredContent);
			expect(text).not.toMatch(/force/i);
			expect(text).toMatch(/publish/i);
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('blocks when the certification for the tree is red', async () => {
		const { client, project, close } = await typeGatedSlice('failure');
		try {
			const refused = await close();
			expect(refused.isError).toBe(true);
			expect(refused.structuredContent).toMatchObject({
				ok: false,
				closed: false,
				blockerDetail: { gate: { state: 'fail' } },
			});
			expect(JSON.stringify(refused.structuredContent)).not.toMatch(
				/force/i,
			);
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('accepts explicit fresh validateEvidence when nothing else can verify the tree', async () => {
		const { client, project, close } = await typeGatedSlice(
			'success',
			false,
		);
		try {
			const closed = await close({
				validateEvidence: {
					timestamp: new Date().toISOString(),
					exitCode: 0,
					logPath: 'validate.jsonl',
				},
			});
			expect(closed.structuredContent).toMatchObject({
				ok: true,
				closed: true,
			});
		} finally {
			await client.close();
			await project.server.close();
		}
	});

	it('does not let explicit validateEvidence override a red certification', async () => {
		const { client, project, close } = await typeGatedSlice('failure');
		try {
			const refused = await close({
				validateEvidence: {
					timestamp: new Date().toISOString(),
					exitCode: 0,
					logPath: 'validate.jsonl',
				},
			});
			expect(refused.structuredContent).toMatchObject({
				ok: false,
				closed: false,
			});
		} finally {
			await client.close();
			await project.server.close();
		}
	});
});
