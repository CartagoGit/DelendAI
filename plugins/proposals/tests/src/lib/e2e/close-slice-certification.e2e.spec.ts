import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createQualityServer,
	seedSlice,
	syncProposals,
	workspaces,
} from './quality-close-slice.harness';

describe('e2e: close_slice from existing certification', () => {
	it('closes from CI evidence for the exact tree, running no gate, and refuses a different tree', async () => {
		const { workspace, client, project } = await createQualityServer(
			'true',
			{
				// A gate that would fail if it ran: closing proves it did not.
				validate: 'exit 1',
				development: {
					profile: 'shared-checkout-pr',
					branches: {
						integration: 'main',
						namespacePrefix: 'delendai',
					},
					integration: { requiredChecks: ['delendai-validate'] },
				},
			},
		);
		const bin = mkdtempSync(join(tmpdir(), 'fake-gh-'));
		workspaces.push(bin);
		writeFileSync(
			join(bin, 'gh'),
			'#!/bin/sh\ncase "$1" in\n  --version) echo gh;;\n  pr) ;;\n  api) printf "delendai-validate\\tcompleted\\tsuccess\\thttps://ci/1\\n";;\nesac\n',
		);
		chmodSync(join(bin, 'gh'), 0o755);
		const path = process.env.PATH;
		process.env.PATH = `${bin}:${path ?? ''}`;
		try {
			seedSlice(workspace, 'f04203');
			expect((await syncProposals(client)).isError).toBeFalsy();
			const claim = await client.callTool({
				name: 'delendai_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: 'f04203-S1',
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
			const close = () =>
				client.callTool({
					name: 'delendai_proposals_close_slice',
					arguments: {
						proposalId: 'f04203',
						sliceId: 'S1',
						force: true,
					},
				});

			// A tree CI never saw: an uncommitted edit is no evidence.
			writeFileSync(join(workspace, 'edited.txt'), 'x');
			const different = await close();
			expect(different.structuredContent).toMatchObject({
				ok: false,
				closed: false,
			});
			expect(different.structuredContent).not.toMatchObject({
				gate: { certifiedBy: 'forge-check' },
			});

			rmSync(join(workspace, 'edited.txt'));
			const closed = await close();
			expect(closed.structuredContent).toMatchObject({
				ok: true,
				closed: true,
				gate: { state: 'pass', certifiedBy: 'forge-check' },
			});
		} finally {
			process.env.PATH = path;
			await client.close();
			await project.server.close();
		}
	});
});
