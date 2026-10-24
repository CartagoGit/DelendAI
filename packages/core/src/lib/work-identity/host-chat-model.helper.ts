/**
 * host-chat-model.helper.ts — the model the editor itself says served the
 * last chat request in this workspace.
 *
 * A chat provider (Universal Chat Provider, a BYO endpoint, Copilot's own
 * models) need not tell delendai anything: the editor records, for every
 * request of every chat session, the model it sent the request to
 * (`modelId`, as `<vendor>/<id>`), in the session files it keeps per
 * workspace. Reading the newest of those for the workspace at hand names
 * the model that is working now, whatever extension provides it, with no
 * cooperation and nothing installed.
 *
 * Only an observation recent enough counts (the bridge's freshness
 * window), and only for the workspace the session belongs to or one
 * inside it, such as a unit's worktree. Two chats open on one workspace
 * with different models are told apart only by which spoke last.
 */
import { isWslHere } from '../platform/system-profile.helper';
import {
	thisUserConfigRoot,
	windowsAppDataUnderWsl,
} from '../platform/user-directories.helper';
import {
	existsSync,
	readdirSync,
	readFileSync,
	openSync,
	readSync,
	closeSync,
	statSync,
} from 'node:fs';
import { delimiter, join } from 'node:path';

import {
	HOST_CHAT_PRODUCTS,
	HOST_SESSION_TAIL_BYTES,
	HOST_SESSIONS_READ,
	HOST_USER_DIRS_VARIABLE,
} from '../contracts/constants/host-chat-model.constant';
import type { IHostChatModel } from '../contracts/interfaces/host-chat-model.interface';
import { PROVIDER_MODEL_MAX_AGE_MS } from './provider-model-bridge.constant';

const listDir = (path: string): readonly string[] => {
	try {
		return readdirSync(path);
	} catch {
		return [];
	}
};

/** The editors' user directories this machine may have, WSL's Windows side included. */
export const hostUserDirs = (
	env: NodeJS.ProcessEnv = process.env,
): readonly string[] => {
	const declared = env[HOST_USER_DIRS_VARIABLE]?.trim();
	if (declared !== undefined && declared.length > 0)
		return declared.split(delimiter).filter((path) => path.length > 0);
	const roots = [
		thisUserConfigRoot(env),
		// A server in WSL serves an editor whose state lives on the Windows side.
		...(isWslHere(env) ? windowsAppDataUnderWsl() : []),
	];
	return roots.flatMap((root) =>
		HOST_CHAT_PRODUCTS.map((product) => join(root, product, 'User')).filter(
			(dir) => existsSync(join(dir, 'workspaceStorage')),
		),
	);
};

/** The local path a workspace folder URI names, whatever host serves it. */
export const folderPathOf = (uri: string): string | undefined => {
	const match = /^(?:file:\/\/|vscode-remote:\/\/[^/]+)(\/.*)$/u.exec(uri);
	if (match?.[1] === undefined) return undefined;
	const path = decodeURIComponent(match[1]);
	// `file:///c:/x` is `c:/x` on Windows.
	return /^\/[a-z]:\//iu.test(path) ? path.slice(1) : path;
};

const belongsTo = (folder: string, workspace: string): boolean =>
	workspace === folder ||
	workspace.startsWith(`${folder.replace(/\/+$/u, '')}/`);

/** The last `modelId` a session file records, read from its end. */
const lastModelIn = (path: string, size: number): string | undefined => {
	const start = Math.max(0, size - HOST_SESSION_TAIL_BYTES);
	const buffer = Buffer.alloc(size - start);
	const fd = openSync(path, 'r');
	try {
		readSync(fd, buffer, 0, buffer.length, start);
	} finally {
		closeSync(fd);
	}
	const found = [
		...buffer.toString('utf8').matchAll(/"modelId"\s*:\s*"([^"]+)"/gu),
	];
	return found.at(-1)?.[1];
};

/**
 * The model of the newest chat request any editor recorded for
 * `workspace`, while it is recent; `undefined` when none is.
 */
export const hostChatModel = (input: {
	readonly workspace: string;
	readonly now?: Date | undefined;
	readonly env?: NodeJS.ProcessEnv | undefined;
}): IHostChatModel | undefined => {
	const now = (input.now ?? new Date()).getTime();
	const sessions: {
		path: string;
		mtime: number;
		size: number;
		host: string;
	}[] = [];
	for (const userDir of hostUserDirs(input.env)) {
		const storage = join(userDir, 'workspaceStorage');
		for (const hash of listDir(storage)) {
			let folder: string | undefined;
			try {
				const meta = JSON.parse(
					readFileSync(join(storage, hash, 'workspace.json'), 'utf8'),
				) as { folder?: unknown };
				folder =
					typeof meta.folder === 'string'
						? folderPathOf(meta.folder)
						: undefined;
			} catch {
				continue;
			}
			if (folder === undefined || !belongsTo(folder, input.workspace))
				continue;
			const dir = join(storage, hash, 'chatSessions');
			for (const name of listDir(dir)) {
				try {
					const stat = statSync(join(dir, name));
					if (
						Math.abs(now - stat.mtimeMs) <=
						PROVIDER_MODEL_MAX_AGE_MS
					)
						sessions.push({
							path: join(dir, name),
							mtime: stat.mtimeMs,
							size: stat.size,
							host: userDir,
						});
				} catch {
					// A session removed while it was listed says nothing.
				}
			}
		}
	}
	for (const session of sessions
		.sort((left, right) => right.mtime - left.mtime)
		.slice(0, HOST_SESSIONS_READ)) {
		const model = lastModelIn(session.path, session.size);
		if (model !== undefined)
			return {
				model,
				at: new Date(session.mtime).toISOString(),
				host: session.host,
			};
	}
	return undefined;
};
