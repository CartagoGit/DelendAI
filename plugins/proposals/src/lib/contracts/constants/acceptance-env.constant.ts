/**
 * acceptance-env.constant.ts — the only variables an acceptance command
 * inherits from the server: what a program needs to find itself, its
 * home, its locale and a temp folder. Tokens and keys the server holds
 * stay with the server.
 */
export const ACCEPTANCE_ENV_KEYS: readonly string[] = [
	'PATH',
	'PATHEXT',
	'HOME',
	'USERPROFILE',
	'USER',
	'LOGNAME',
	'LANG',
	'LC_ALL',
	'LC_CTYPE',
	'TERM',
	'TMPDIR',
	'TEMP',
	'TMP',
	'SYSTEMROOT',
	'COMSPEC',
	'APPDATA',
	'LOCALAPPDATA',
];
