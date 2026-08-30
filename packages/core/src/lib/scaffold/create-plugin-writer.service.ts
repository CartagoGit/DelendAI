import type { IPluginWiringFs } from '../contracts/interfaces/plugin-wiring.interface';

export const createOverlayFs = (
	baseFs: IPluginWiringFs,
): IPluginWiringFs & {
	readonly snapshot: () => readonly {
		readonly path: string;
		readonly content: string;
	}[];
} => {
	const overlay = new Map<string, string>();
	return {
		snapshot() {
			return [...overlay.entries()].map(([path, content]) => ({
				path,
				content,
			}));
		},
		async readFile(path) {
			const fromOverlay = overlay.get(path);
			if (fromOverlay !== undefined) return fromOverlay;
			return baseFs.readFile(path);
		},
		async writeFile(path, content) {
			overlay.set(path, content);
		},
		async pathExists(path) {
			return overlay.has(path) || (await baseFs.pathExists(path));
		},
	};
};

const _sanitizeSummary = (value: string): string =>
	value.replace(/\s+/gu, ' ').trim();

const _escapeSingleQuotes = (value: string): string =>
	value.replace(/'/gu, "\\'");

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const _deriveRegistryTags = (pluginId: string): readonly string[] => {
	const parts = pluginId
		.split('-')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	return [...new Set([...parts, 'scaffolded'])];
};

export const writeHostConfig = async ({
	pluginId,
	fs,
}: {
	readonly pluginId: string;
	readonly fs: IPluginWiringFs;
}): Promise<void> => {
	const path = 'mcp-vertex.config.json';
	const parsed = JSON.parse(await fs.readFile(path)) as {
		plugins?: Record<string, unknown>;
		[key: string]: unknown;
	};
	const plugins = parsed.plugins ?? {};
	if (pluginId in plugins) {
		return;
	}
	parsed.plugins = {
		...plugins,
		[pluginId]: { options: {} },
	};
	await fs.writeFile(path, `${JSON.stringify(parsed, null, '\t')}\n`);
};

export const writeFirstPartyIndex = async ({
	pluginId,
	description: _description,
	fs,
}: {
	readonly pluginId: string;
	readonly description: string;
	readonly fs: IPluginWiringFs;
}): Promise<void> => {
	const path = 'packages/core/src/lib/registry/first-party-index.ts';
	const previous = await fs.readFile(path);
	if (new RegExp(`id:\\s*'${escapeRegex(pluginId)}'`, 'u').test(previous)) {
		return;
	}
	// f00175: the first-party registry is now 100% generated from
	// plugin.manifest.ts files. Scaffolding no longer patches manual
	// entries here; the new plugin appears after its manifest is added and
	// the manifest generators are run.
};

export const stagePluginScaffold = async ({
	files,
	fs,
}: {
	readonly files: readonly {
		readonly path: string;
		readonly content: string;
	}[];
	readonly fs: IPluginWiringFs;
}): Promise<void> => {
	for (const file of files) {
		await fs.writeFile(file.path, file.content);
	}
};
