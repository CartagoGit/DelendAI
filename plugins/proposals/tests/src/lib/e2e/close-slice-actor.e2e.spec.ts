import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	createQualityServer,
	seedSlice,
	workspaces,
} from './quality-close-slice.harness';

const ID = 'f04204';
const UNIT = (agent: string): string =>
	`delendai/wip/${agent}/implement/${ID}-S1-g1/the-topic`;

type IServer = Awaited<ReturnType<typeof createQualityServer>>;

/** A server over a repo holding the proposal, and a unit worktree of it. */
const startWith = async (
	agent: string,
): Promise<{ server: IServer; unit: string }> => {
	const server = await createQualityServer('true', {
		development: {
			profile: 'shared-checkout-pr',
			branches: { integration: 'main', namespacePrefix: 'delendai' },
			integration: { requiredChecks: ['delendai-validate'] },
		},
	});
	const { workspace } = server;
	seedSlice(workspace, ID);
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: workspace, stdio: 'ignore' });
	git('config', 'user.email', 'e2e@example.com');
	git('config', 'user.name', 'E2E');
	git('config', 'commit.gpgsign', 'false');
	writeFileSync(join(workspace, '.gitignore'), '.cache/\n');
	git('add', '-A');
	git('commit', '-q', '-m', 'seed');
	const unit = `${workspace}-unit`;
	workspaces.push(unit);
	git('worktree', 'add', '-q', '-b', UNIT(agent), unit);
	return { server, unit };
};

const close = (server: IServer, args: object) =>
	server.client.callTool({
		name: 'delendai_proposals_close_slice',
		arguments: { proposalId: ID, sliceId: 'S1', force: true, ...args },
	});

describe('e2e: close_slice resolves who is closing', () => {
	beforeEach(() => {
		vi.stubEnv('DELENDAI_AGENT_ID', '');
	});
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('lets the owner of the unit the checkout is on close, with no claim', async () => {
		const { server, unit } = await startWith('agent-owner');
		try {
			const result = await close(server, { checkout: unit });
			expect(result.structuredContent).not.toMatchObject({
				blockerType: 'swarm-validation-blocked',
			});
		} finally {
			await server.client.close();
			await server.project.server.close();
		}
	});

	it('refuses a caller that is not the unit owner, naming who it resolved', async () => {
		const { server, unit } = await startWith('agent-owner');
		try {
			const result = await close(server, {
				checkout: unit,
				agent: 'agent-intruder',
			});
			expect(result.structuredContent).toMatchObject({
				ok: false,
				blockerType: 'swarm-validation-blocked',
			});
			const text = JSON.stringify(result.structuredContent);
			expect(text).toContain('resolved actor: agent-intruder');
			expect(text).toContain(`claim for ${ID}-S1: none`);
		} finally {
			await server.client.close();
			await server.project.server.close();
		}
	});

	it("accepts a claim spelled proposal/slice made under the caller's name", async () => {
		const { server, unit } = await startWith('agent-owner');
		try {
			const claim = await server.client.callTool({
				name: 'delendai_proposals_agent_lock',
				arguments: {
					action: 'claim',
					task_id: `${ID}/S1`,
					agent: 'agent-other',
					files: ['src/quality.ts'],
				},
			});
			expect(claim.isError).toBeFalsy();
			const result = await close(server, {
				checkout: unit,
				agent: 'agent-other',
			});
			expect(result.structuredContent).not.toMatchObject({
				blockerType: 'swarm-validation-blocked',
			});
		} finally {
			await server.client.close();
			await server.project.server.close();
		}
	});
});
