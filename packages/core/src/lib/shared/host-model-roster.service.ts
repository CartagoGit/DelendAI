/**
 * host-model-roster.service.ts — the models an editor serves on the
 * person's own keys (Copilot BYOK in VS Code), read by name from every
 * profile.
 *
 * The editor keeps them per profile, in `<User>/profiles/<id>/
 * chatLanguageModels.json`; the user directory's own copy is often empty,
 * which is how an earlier reading concluded they were in secret storage.
 * The same file holds each provider's API key inline, so nothing here
 * copies a field it does not name: a model is described by an allowlist
 * (id, name, endpoint host, capabilities), and no other field of the file
 * — a key, a header, a token — reaches a result, a log or a comparison.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

import { parse as parseJsonc } from 'jsonc-parser';

import {
	DEFAULT_PROFILE_FOLDER,
	HOST_BYOK_CACHE_FILE,
	HOST_BYOK_CACHE_VARIABLE,
	HOST_BYOK_FILE,
	HOST_DEFAULT_PROFILE,
	HOST_GLOBAL_STORAGE_FILE,
	HOST_PROFILES_FOLDER,
} from '../contracts/constants/host-byok.constant';
import type {
	IHostByokModel,
	IHostByokProvider,
	IHostByokSnapshot,
} from '../contracts/interfaces/host-byok.interface';
import {
	folderPathOf,
	hostUserDirs,
} from '../work-identity/host-chat-model.helper';
import { writeFileAtomicSync } from './atomic-write';
import { isRecord } from './is-record';

const text = (value: unknown): string | undefined =>
	typeof value === 'string' && value.length > 0 ? value : undefined;

const flag = (value: unknown): boolean | undefined =>
	typeof value === 'boolean' ? value : undefined;

const count = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) && value > 0
		? value
		: undefined;

/** The host of an endpoint URL, never its path, query or credentials. */
const hostOf = (value: unknown): string | undefined => {
	const url = text(value);
	if (url === undefined) return undefined;
	try {
		return new URL(url).host || undefined;
	} catch {
		return undefined;
	}
};

const readJsonc = (path: string): unknown => {
	try {
		return parseJsonc(readFileSync(path, 'utf8'));
	} catch {
		return undefined;
	}
};

/** One model, from the fields this module names and no others. */
const modelOf = (raw: unknown): IHostByokModel | undefined => {
	if (!isRecord(raw)) return undefined;
	const id = text(raw.id);
	if (id === undefined) return undefined;
	const efforts = Array.isArray(raw.supportsReasoningEffort)
		? raw.supportsReasoningEffort.filter(
				(effort): effort is string => typeof effort === 'string',
			)
		: [];
	const described: IHostByokModel = {
		id,
		name: text(raw.name),
		endpointHost: hostOf(raw.url),
		toolCalling: flag(raw.toolCalling),
		vision: flag(raw.vision),
		thinking: flag(raw.thinking),
		contextWindow: count(raw.contextWindow),
		...(efforts.length > 0 ? { reasoningEfforts: efforts } : {}),
	};
	return Object.fromEntries(
		Object.entries(described).filter(([, value]) => value !== undefined),
	) as IHostByokModel;
};

/** The profile folders of a user directory, with the names the editor shows. */
const profilesOf = (
	userDir: string,
): readonly {
	readonly folder: string;
	readonly dir: string;
	readonly name?: string | undefined;
}[] => {
	const storage = readJsonc(join(userDir, HOST_GLOBAL_STORAGE_FILE));
	const names = new Map<string, string>();
	if (isRecord(storage) && Array.isArray(storage.userDataProfiles))
		for (const profile of storage.userDataProfiles)
			if (isRecord(profile)) {
				const location = text(profile.location);
				const name = text(profile.name);
				if (location !== undefined && name !== undefined)
					names.set(location, name);
			}
	let folders: string[] = [];
	try {
		folders = readdirSync(join(userDir, HOST_PROFILES_FOLDER));
	} catch {
		folders = [];
	}
	return [
		{ folder: DEFAULT_PROFILE_FOLDER, dir: userDir },
		...folders.map((folder) => ({
			folder,
			dir: join(userDir, HOST_PROFILES_FOLDER, folder),
			...(names.has(folder) ? { name: names.get(folder) } : {}),
		})),
	];
};

/**
 * Every BYOK provider the editors on this machine keep, profile by
 * profile; nothing when none is configured.
 */
export const hostByokRoster = (
	env: NodeJS.ProcessEnv = process.env,
): readonly IHostByokProvider[] => {
	const providers: IHostByokProvider[] = [];
	for (const host of hostUserDirs(env)) {
		for (const profile of profilesOf(host)) {
			const path = join(profile.dir, HOST_BYOK_FILE);
			if (!existsSync(path)) continue;
			const listed = readJsonc(path);
			if (!Array.isArray(listed)) continue;
			for (const raw of listed) {
				if (!isRecord(raw)) continue;
				const vendor = text(raw.vendor);
				if (vendor === undefined) continue;
				providers.push({
					host,
					profile: profile.folder,
					...(profile.name !== undefined
						? { profileName: profile.name }
						: {}),
					name: text(raw.name) ?? vendor,
					vendor,
					models: (Array.isArray(raw.models) ? raw.models : [])
						.map(modelOf)
						.filter(
							(model): model is IHostByokModel =>
								model !== undefined,
						),
				});
			}
		}
	}
	return providers;
};

/**
 * The profile `workspace` opens in, per the editor that keeps `host`: its
 * folder under `profiles/`, `default`, or `undefined` when the editor does
 * not associate the workspace with one.
 */
export const hostProfileOf = (
	host: string,
	workspace: string,
): string | undefined => {
	const storage = readJsonc(join(host, HOST_GLOBAL_STORAGE_FILE));
	if (!isRecord(storage) || !isRecord(storage.profileAssociations))
		return undefined;
	const workspaces = storage.profileAssociations.workspaces;
	if (!isRecord(workspaces)) return undefined;
	let best: { readonly length: number; readonly profile: string } | undefined;
	for (const [uri, profile] of Object.entries(workspaces)) {
		const folder = folderPathOf(uri);
		const name = text(profile);
		if (folder === undefined || name === undefined) continue;
		const inside =
			workspace === folder ||
			workspace.startsWith(`${folder.replace(/\/+$/u, '')}/`);
		if (inside && (best === undefined || folder.length > best.length))
			best = { length: folder.length, profile: name };
	}
	if (best === undefined) return undefined;
	return best.profile === HOST_DEFAULT_PROFILE
		? DEFAULT_PROFILE_FOLDER
		: best.profile;
};

/** Where the roster the server detected is kept. */
export const hostByokCachePath = (
	env: NodeJS.ProcessEnv = process.env,
): string => {
	const declared = env[HOST_BYOK_CACHE_VARIABLE]?.trim();
	return declared !== undefined && declared.length > 0
		? declared
		: join(homedir(), '.cache', 'delendai', HOST_BYOK_CACHE_FILE);
};

/**
 * Detect this machine's BYOK roster and keep it in the user cache. Run
 * when the server starts, so a clone on another machine configures itself
 * from that machine's editors, or finds none; nothing is read from or
 * written to the repository. Never fails its caller.
 */
export const detectHostByok = (
	input: {
		readonly env?: NodeJS.ProcessEnv | undefined;
		readonly now?: Date | undefined;
	} = {},
): IHostByokSnapshot => {
	const env = input.env ?? process.env;
	const snapshot: IHostByokSnapshot = {
		detectedAt: (input.now ?? new Date()).toISOString(),
		hosts: hostUserDirs(env),
		providers: hostByokRoster(env),
	};
	try {
		const path = hostByokCachePath(env);
		mkdirSync(dirname(path), { recursive: true });
		writeFileAtomicSync(path, `${JSON.stringify(snapshot, null, '\t')}\n`);
	} catch {
		// An unwritable cache leaves the roster detected for this run only.
	}
	return snapshot;
};
