/**
 * host-chat-model.constant.ts — where the editors that keep chat sessions
 * per workspace keep them, and how much of a session is read.
 */

/** Editors of the VS Code family: each keeps `<user dir>/workspaceStorage/<hash>/chatSessions`. */
export const HOST_CHAT_PRODUCTS: readonly string[] = [
	'Code',
	'Code - Insiders',
	'Cursor',
	'VSCodium',
	'Windsurf',
];

/** Overrides where the host user directories are looked for, path-delimited. */
export const HOST_USER_DIRS_VARIABLE = 'DELENDAI_HOST_USER_DIRS';

/** How much of the end of a session file is read to find its last request. */
export const HOST_SESSION_TAIL_BYTES = 2 * 1024 * 1024;

/** How many of a workspace's newest sessions are looked at. */
export const HOST_SESSIONS_READ = 3;

/** The file, in the user cache, that remembers the model ids the host was seen serving. */
export const SEEN_MODELS_FILE = 'models-seen.json';

/** Overrides where the seen-model catalog is kept. */
export const SEEN_MODELS_VARIABLE = 'DELENDAI_SEEN_MODELS_FILE';
