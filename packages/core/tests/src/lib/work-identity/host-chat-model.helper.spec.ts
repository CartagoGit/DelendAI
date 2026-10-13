import {
	mkdirSync,
	mkdtempSync,
	rmSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	folderPathOf,
	hostChatModel,
} from '../../../../src/lib/work-identity/host-chat-model.helper';
import { providerModelReading } from '../../../../src/lib/work-identity/provider-model-bridge.helper';

describe('the model the editor recorded', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const editor = (folder: string, lines: readonly string[], ageMs = 0) => {
		const user = mkdtempSync(join(tmpdir(), 'host-user-'));
		dirs.push(user);
		const storage = join(user, 'workspaceStorage', 'abc');
		mkdirSync(join(storage, 'chatSessions'), { recursive: true });
		writeFileSync(
			join(storage, 'workspace.json'),
			JSON.stringify({ folder }),
		);
		const session = join(storage, 'chatSessions', 's.jsonl');
		writeFileSync(session, `${lines.join('\n')}\n`);
		const when = new Date(Date.now() - ageMs);
		utimesSync(session, when, when);
		return {
			DELENDAI_HOST_USER_DIRS: user,
			DELENDAI_PROVIDER_MODEL_FILE: join(user, 'none.json'),
		};
	};
	const request = (model: string) =>
		JSON.stringify({
			kind: 2,
			k: ['requests'],
			v: [{ requestId: 'r', timestamp: 1, modelId: model }],
		});

	it('reads the last request of the workspace, a worktree inside it included', () => {
		const env = editor('vscode-remote://wsl%2Bubuntu/work/acme', [
			request('copilot/gpt-5'),
			request('minimax/MiniMax-M3.1-Flash-Preview'),
		]);
		expect(
			hostChatModel({
				workspace: '/work/acme/.cache/delendai/.worktrees/u',
				env,
			}),
		).toMatchObject({
			model: 'minimax/MiniMax-M3.1-Flash-Preview',
		});
		expect(
			hostChatModel({ workspace: '/work/other', env }),
		).toBeUndefined();
	});

	it('says nothing about a session too old to be the one working now', () => {
		const env = editor(
			'file:///work/acme',
			[request('copilot/gpt-5')],
			60 * 60 * 1000,
		);
		expect(hostChatModel({ workspace: '/work/acme', env })).toBeUndefined();
	});

	it('names the model through the bridge reading when no provider publishes', () => {
		const env = {
			...editor('file:///work/acme', [
				request('universal-chat-provider/gpt-6.1-sol'),
			]),
			DELENDAI_SEEN_MODELS_FILE: join(
				tmpdir(),
				`seen-${String(process.pid)}.json`,
			),
		};
		expect(
			providerModelReading({ workspace: '/work/acme', env }),
		).toMatchObject({ model: 'universal-chat-provider/gpt-6.1-sol' });
	});

	it('reads workspace folders as every host writes them', () => {
		expect(folderPathOf('file:///home/me/p')).toBe('/home/me/p');
		expect(folderPathOf('vscode-remote://wsl%2Bubuntu/home/me/p%20x')).toBe(
			'/home/me/p x',
		);
		expect(folderPathOf('file:///c%3A/Users/me/p')).toBe('c:/Users/me/p');
		expect(folderPathOf('untitled:1')).toBeUndefined();
	});
});
