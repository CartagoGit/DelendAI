import type { IPluginWiringFs } from '../contracts/interfaces/plugin-wiring.interface';
import { validateStructuredText } from './scaffold-text-structure.service';

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

const sanitizeSummary = (value: string): string =>
	value.replace(/\s+/gu, ' ').trim();

const escapeSingleQuotes = (value: string): string =>
	value.replace(/'/gu, "\\'");

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

const deriveRegistryTags = (pluginId: string): readonly string[] => {
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
	description,
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
	const anchor = '\t\t...GENERATED_FIRST_PARTY_MANIFEST_ENTRIES,';
	const anchorIndex = previous.indexOf(anchor);
	if (anchorIndex < 0) {
		throw new Error(
			`Could not find GENERATED_FIRST_PARTY_MANIFEST_ENTRIES anchor in ${path}`,
		);
	}
	const tags = deriveRegistryTags(pluginId)
		.map((tag) => `'${escapeSingleQuotes(tag)}'`)
		.join(', ');
	const block = [
		'\t\t{',
		"\t\t\torigin: 'first-party',",
		`\t\t\tid: '${pluginId}',`,
		`\t\t\tpackage: '@mcp-vertex/${pluginId}',`,
		`\t\t\tsummary: '${escapeSingleQuotes(sanitizeSummary(description))}',`,
		`\t\t\ttags: [${tags}],`,
		'\t\t\tpermissions: [],',
		"\t\t\tdefaultPreset: 'vertex',",
		'\t\t},',
	].join('\n');
	const next = `${previous.slice(0, anchorIndex)}${block}\n${previous.slice(anchorIndex)}`;
	validateStructuredText(path, next);
	await fs.writeFile(path, next);
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
