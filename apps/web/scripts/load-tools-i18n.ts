import { existsSync, readFileSync } from 'node:fs';
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

const findConfigPath = (startDir: string): string => {
	let cur = startDir;
	while (true) {
		const candidate = resolve(cur, 'mcp-vertex.config.json');
		if (existsSync(candidate)) {
			return candidate;
		}
		const parent = dirname(cur);
		if (parent === cur) {
			break;
		}
		cur = parent;
	}
	return resolve(startDir, '..', '..', '..', 'mcp-vertex.config.json');
};

const CONFIG_PATH = findConfigPath(HERE);

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
