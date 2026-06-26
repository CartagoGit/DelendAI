import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type IConfigFile = {
	readonly namespacePrefix?: string;
	readonly plugins?: Readonly<
		Record<
			string,
			{
				readonly options?: Readonly<{
					readonly namespacePrefix?: string;
				}>;
			}
		>
	>;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const CONFIG_PATH = resolve(ROOT, 'mcp-vertex.config.json');

const readConfig = (): IConfigFile =>
	JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as IConfigFile;

export const resolveToolsNamespacePrefix = (): string => {
	const config = readConfig();
	if (
		typeof config.namespacePrefix === 'string' &&
		config.namespacePrefix.trim()
	) {
		return config.namespacePrefix.trim();
	}
	for (const plugin of Object.values(config.plugins ?? {})) {
		const candidate = plugin.options?.namespacePrefix;
		if (typeof candidate === 'string' && candidate.trim()) {
			return candidate.trim();
		}
	}
	return 'mcp-vertex';
};
