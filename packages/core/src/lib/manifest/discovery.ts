import { access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { IPluginManifest } from '../contracts/interfaces/plugin-manifest.interface';
import { parsePluginManifest } from './define-plugin-manifest';

const PLUGINS_DIR = 'plugins';
const MANIFEST_FILE = 'plugin.manifest.ts';

const manifestFromModule = (
	module: Record<string, unknown>,
): IPluginManifest => {
	for (const value of Object.values(module)) {
		try {
			return parsePluginManifest(value);
		} catch {}
	}
	throw new Error('module does not export a valid plugin manifest');
};

export const discoverPluginManifests = async (
	rootDir = process.cwd(),
): Promise<readonly string[]> => {
	const pluginsDir = resolve(rootDir, PLUGINS_DIR);
	let entries: import('node:fs').Dirent[];
	try {
		entries = await readdir(pluginsDir, { withFileTypes: true });
	} catch {
		return [];
	}
	const manifestPaths: string[] = [];
	for (const entry of entries.sort((left, right) =>
		left.name.localeCompare(right.name),
	)) {
		if (!entry.isDirectory()) continue;
		const manifestPath = join(pluginsDir, entry.name, MANIFEST_FILE);
		try {
			await access(manifestPath);
			manifestPaths.push(manifestPath);
		} catch {}
	}
	return manifestPaths;
};

export const loadAllPluginManifests = async (
	rootDir = process.cwd(),
): Promise<readonly IPluginManifest[]> => {
	const manifestPaths = await discoverPluginManifests(rootDir);
	const manifests: IPluginManifest[] = [];
	for (const manifestPath of manifestPaths) {
		const mod = (await import(
			`${pathToFileURL(manifestPath).href}?t=${Date.now()}`
		)) as Record<string, unknown>;
		manifests.push(manifestFromModule(mod));
	}
	return manifests;
};
