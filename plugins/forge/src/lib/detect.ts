import { readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import { forgeProviderOfHost } from './services/forge';

export type IForgeProvider = 'github' | 'gitlab' | 'unknown';

const ORIGIN_SECTION_RE = /^\s*\[remote\s+"origin"\]\s*$/u;
const SECTION_RE = /^\s*\[/u;
const URL_RE = /^\s*url\s*=\s*(.+?)\s*$/u;

const configPathFromGitMarker = async (cwd: string): Promise<string> => {
	const dotGitPath = join(cwd, '.git');
	const marker = await readFile(dotGitPath, 'utf8').catch(() => undefined);
	if (marker === undefined) {
		return join(dotGitPath, 'config');
	}
	const trimmed = marker.trim();
	if (!trimmed.startsWith('gitdir:')) {
		return join(dotGitPath, 'config');
	}
	const rawGitDir = trimmed.slice('gitdir:'.length).trim();
	const gitDir = isAbsolute(rawGitDir) ? rawGitDir : resolve(cwd, rawGitDir);
	return join(gitDir, 'config');
};

export const readOriginRemoteUrl = async (
	cwd: string,
): Promise<string | undefined> => {
	const configPath = await configPathFromGitMarker(cwd);
	const config = await readFile(configPath, 'utf8').catch(() => undefined);
	if (config === undefined) return undefined;
	let inOrigin = false;
	for (const line of config.split(/\r?\n/u)) {
		if (ORIGIN_SECTION_RE.test(line)) {
			inOrigin = true;
			continue;
		}
		if (inOrigin && SECTION_RE.test(line)) {
			break;
		}
		if (!inOrigin) continue;
		const match = line.match(URL_RE);
		if (match !== null) return match[1]?.trim();
	}
	return undefined;
};

/** The forge an origin URL points at, by the one host classifier. */
export const detectForgeProviderFromRemote = (
	remoteUrl: string | null | undefined,
): IForgeProvider => {
	if (remoteUrl === null || remoteUrl === undefined) return 'unknown';
	const trimmed = remoteUrl.trim();
	const host =
		/^(?:[^@/]+@)?([^:/]+):(?!\/)/u.exec(trimmed)?.[1] ??
		/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)/iu.exec(trimmed)?.[1];
	return (
		(host === undefined ? undefined : forgeProviderOfHost(host)) ??
		'unknown'
	);
};

export const detectForgeProvider = async (
	cwd: string,
): Promise<IForgeProvider> =>
	detectForgeProviderFromRemote(await readOriginRemoteUrl(cwd));
