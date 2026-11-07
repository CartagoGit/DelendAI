/**
 * f00082 — `commit-author.ts` resolver contract.
 *
 * The resolver is the single source of truth for which `Name <email>`
 * string is passed to `git commit --author=…`. It MUST stay pure
 * (no `process.cwd`, no `process.env`, no filesystem) so tests can
 * drive every branch with a mock `IGitConfigReader` and a literal
 * identity.
 */
import { describe, expect, it } from 'vitest';

import {
	COMMIT_AUTHOR_MODES,
	createGitConfigReader,
	resolveCommitAuthor,
} from '../../../../src/lib/shared/commit-author';
import type {
	ICommitAuthorInput,
	IGitConfigReader,
} from '../../../../src/lib/shared/commit-author';

const fixedReader = (
	name: string | undefined,
	email: string | undefined,
): IGitConfigReader => ({
	getUserName: async () => name,
	getUserEmail: async () => email,
});

const baseInput: Omit<ICommitAuthorInput, 'mode'> = {
	identity: {
		clientName: 'vscode-copilot',
		modelName: 'MiniMax-M3',
	},
	named: {
		humanName: 'Cartago',
		humanEmail: 'cartago@example.com',
	},
};

describe('resolveCommitAuthor — mode matrix', () => {
	it('exports the canonical 4-mode list', () => {
		expect([...COMMIT_AUTHOR_MODES]).toEqual([
			'git',
			'agent',
			'bot',
			'named',
		]);
	});

	it('mode "git" returns Name <email> from the repo config', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'git' },
			fixedReader('Ana Ruiz', 'ana@example.com'),
		);
		expect(r.authorFlag).toBe('Ana Ruiz <ana@example.com>');
		expect(r.reason).toBeUndefined();
		expect(r.label).toContain('git');
	});

	it('mode "git" refuses when user.name is missing', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'git' },
			fixedReader(undefined, 'ana@example.com'),
		);
		expect(r.authorFlag).toBe('');
		expect(r.reason).toMatch(/requires.*user\.name/u);
	});

	it('mode "git" refuses when user.email is missing', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'git' },
			fixedReader('Ana Ruiz', undefined),
		);
		expect(r.authorFlag).toBe('');
		expect(r.reason).toMatch(/requires.*user\.email/u);
	});

	it('mode "agent" derives "<clientName> <<clientName>@local>"', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'agent' },
			fixedReader(undefined, undefined),
		);
		expect(r.authorFlag).toBe('vscode-copilot <vscode-copilot@local>');
		expect(r.reason).toBeUndefined();
	});

	it('mode "agent" sanitises non-identifier clientName chars', async () => {
		const r = await resolveCommitAuthor(
			{
				...baseInput,
				mode: 'agent',
				identity: { clientName: 'Claude Code', modelName: 'opus-4' },
			},
			fixedReader(undefined, undefined),
		);
		// Spaces and capitalisation get rewritten into a safe local part.
		expect(r.authorFlag).toBe('Claude Code <Claude-Code@local>');
	});

	it('mode "bot" produces "<clientName>-bot <<…>@users.noreply.github.com>"', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'bot' },
			fixedReader(undefined, undefined),
		);
		expect(r.authorFlag).toBe(
			'vscode-copilot-bot <vscode-copilot-bot@users.noreply.github.com>',
		);
		expect(r.reason).toBeUndefined();
	});

	it('mode "named" produces quoted "<humanName> (<modelName>)" <humanEmail>', async () => {
		const r = await resolveCommitAuthor(
			{ ...baseInput, mode: 'named' },
			fixedReader(undefined, undefined),
		);
		// The surrounding quotes are part of the flag so the parentheses
		// + spaces survive the shell; git accepts them on `--author=`.
		expect(r.authorFlag).toBe(
			'"Cartago (MiniMax-M3)" <cartago@example.com>',
		);
		expect(r.reason).toBeUndefined();
	});

	it('mode "named" falls back to clientName when humanName is empty', async () => {
		const r = await resolveCommitAuthor(
			{
				...baseInput,
				mode: 'named',
				named: { humanName: '', humanEmail: 'cartago@example.com' },
			},
			fixedReader(undefined, undefined),
		);
		expect(r.authorFlag).toBe(
			'"vscode-copilot (MiniMax-M3)" <cartago@example.com>',
		);
	});

	it('mode "named" falls back to <client>@local when humanEmail is empty', async () => {
		const r = await resolveCommitAuthor(
			{
				...baseInput,
				mode: 'named',
				named: { humanName: 'Cartago', humanEmail: '' },
			},
			fixedReader(undefined, undefined),
		);
		expect(r.authorFlag).toBe(
			'"Cartago (MiniMax-M3)" <vscode-copilot@local>',
		);
	});

	it('falls back to "agent" / "unknown-model" when identity fields are empty', async () => {
		const r = await resolveCommitAuthor(
			{
				mode: 'agent',
				identity: { clientName: '', modelName: '' },
				named: { humanName: '', humanEmail: '' },
			},
			fixedReader(undefined, undefined),
		);
		expect(r.authorFlag).toBe('agent <agent@local>');
	});
});

describe('createGitConfigReader', () => {
	it('returns the trimmed value when the git runner exits 0', async () => {
		const reader = createGitConfigReader(async (args) => {
			if (args[0] === 'config' && args[1] === 'user.name') {
				return { ok: true, output: '  Ana Ruiz  \n' };
			}
			return { ok: true, output: 'ana@example.com' };
		});
		expect(await reader.getUserName()).toBe('Ana Ruiz');
		expect(await reader.getUserEmail()).toBe('ana@example.com');
	});

	it('returns undefined on runner failure', async () => {
		const reader = createGitConfigReader(async () => ({
			ok: false,
			output: '',
			reason: 'git missing',
		}));
		expect(await reader.getUserName()).toBeUndefined();
		expect(await reader.getUserEmail()).toBeUndefined();
	});

	it('returns undefined on empty / whitespace output', async () => {
		const reader = createGitConfigReader(async () => ({
			ok: true,
			output: '   \n',
		}));
		expect(await reader.getUserName()).toBeUndefined();
	});
});
