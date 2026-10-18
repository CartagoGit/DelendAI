/**
 * client-discovery.service.spec.ts — a client's verdict comes from its own
 * answer, and names the command and the line that decided it.
 */
import { describe, expect, it } from 'vitest';

import { KNOWN_CLIENTS } from '../../../../src/lib/contracts/constants/known-clients.constant';
import type { IClientCommandRunner } from '../../../../src/lib/contracts/interfaces/known-client.interface';
import {
	clientVerdict,
	discoverClients,
	listClientModels,
} from '../../../../src/lib/shared/client-discovery.service';

const client = (command: string) => {
	const found = KNOWN_CLIENTS.find((each) => each.command === command);
	if (found === undefined) throw new Error(`no client ${command}`);
	return found;
};

describe('clientVerdict', () => {
	it('reads usable, with the line that said so and no address in it', () => {
		expect(
			clientVerdict(client('claude'), {
				code: 0,
				output: 'Logged in as someone@example.com\nPlan: Pro subscription',
			}),
		).toEqual({
			verdict: 'usable',
			evidence: {
				command: 'claude auth status',
				line: 'Logged in as <email>',
			},
		});
	});

	it('reads what stops a client from its own words', () => {
		const said = (output: string, code = 0) =>
			clientVerdict(client('codex'), { code, output }).verdict;
		expect(said('Not logged in', 1)).toBe('needs-login');
		expect(said('Logged in\nNo active subscription for this account')).toBe(
			'needs-plan',
		);
		expect(said('Usage limit reached for this window')).toBe(
			'quota-exhausted',
		);
		expect(said('', 2)).toBe('needs-login');
	});

	it('reads an OpenCode with one credential as usable, and with none as needing a login', () => {
		expect(
			clientVerdict(client('opencode'), {
				code: 0,
				output: '┌  Credentials\n●  MiniMax (minimax.io) api\n└  1 credentials',
			}).verdict,
		).toBe('usable');
		expect(
			clientVerdict(client('opencode'), {
				code: 0,
				output: '┌  Credentials\n└  0 credentials',
			}).verdict,
		).toBe('needs-login');
	});

	it('is unknown, never a guess, for a client with no way to tell', () => {
		expect(
			clientVerdict(client('gemini'), { code: 0, output: 'ok' }),
		).toEqual({
			verdict: 'unknown',
			evidence: null,
		});
		expect(clientVerdict(client('claude'), undefined).verdict).toBe(
			'unknown',
		);
	});
});

describe('discoverClients', () => {
	const runner =
		(
			answers: Record<string, { code: number; output: string }>,
		): IClientCommandRunner =>
		async (command) =>
			answers[command] ?? { code: 1, output: '' };

	it('asks only installed clients, and asks about logins only with consent', async () => {
		const answers = {
			'command -v claude': { code: 0, output: '/bin/claude' },
			'claude --version': { code: 0, output: '2.1.0 (Claude Code)' },
			'claude auth status': { code: 0, output: 'Logged in' },
		};
		const clients = [client('claude'), client('codex')];
		const withConsent = await discoverClients(
			runner(answers),
			'/ws',
			{ login: true },
			clients,
		);
		expect(
			withConsent.map(({ client: c, verdict, path, version }) => ({
				id: c.id,
				verdict,
				path,
				version,
			})),
		).toEqual([
			{
				id: 'claude-cli',
				verdict: 'usable',
				path: '/bin/claude',
				version: '2.1.0 (Claude Code)',
			},
			{
				id: 'codex-cli',
				verdict: 'not-installed',
				path: null,
				version: null,
			},
		]);
		const without = await discoverClients(
			runner(answers),
			'/ws',
			{ login: false },
			clients,
		);
		expect(without[0]?.verdict).toBe('unknown');
	});
});

describe('listClientModels', () => {
	const answering =
		(code: number, output: string): IClientCommandRunner =>
		async () => ({ code, output });

	it('groups the models a host client reports by provider, as it reports them', async () => {
		const listed = await listClientModels(
			client('opencode'),
			answering(
				0,
				'minimax/MiniMax-M2\nminimax/MiniMax-M3\nopencode/big-pickle\nnot a model line\n',
			),
			'/ws',
		);
		expect(listed).toEqual({
			listed: true,
			providers: [
				{ provider: 'minimax', models: ['MiniMax-M2', 'MiniMax-M3'] },
				{ provider: 'opencode', models: ['big-pickle'] },
			],
		});
	});

	it('says so when the client offers no listing, or does not answer', async () => {
		expect(
			await listClientModels(client('claude'), answering(0, ''), '/ws'),
		).toMatchObject({
			listed: false,
			reason: expect.stringContaining('no way to list'),
		});
		expect(
			await listClientModels(client('opencode'), answering(1, ''), '/ws'),
		).toMatchObject({
			listed: false,
			reason: 'opencode models did not answer',
		});
	});
});
