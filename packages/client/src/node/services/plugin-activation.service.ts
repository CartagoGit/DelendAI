import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import {
	DEFAULT_CONFIG_FILENAME,
	resolveWorkspaceContained,
} from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';
import type {
	IDelendaiConfigFile,
	IDelendaiPluginConfig,
	PluginOrigin,
} from '@delendai/core/public';
import type {
	ISetPluginActivationInput,
	ISetPluginActivationResult,
} from '../../lib/contracts/interfaces/plugin-activation.interface';

const readConfig = async (configFile: string): Promise<IDelendaiConfigFile> => {
	let raw: string;
	try {
		raw = await readFile(configFile, 'utf8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw new Error(`Unable to read config file "${configFile}"`, {
			cause: error,
		});
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`Invalid JSON in config file "${configFile}"`, {
			cause: error,
		});
	}
	if (
		parsed === null ||
		typeof parsed !== 'object' ||
		Array.isArray(parsed)
	) {
		throw new Error(
			`Config file "${configFile}" must contain a JSON object`,
		);
	}
	return parsed as IDelendaiConfigFile;
};

const setExternalServerActivation = (
	config: IDelendaiConfigFile,
	id: string,
	active: boolean,
): IDelendaiConfigFile => {
	const serverId = id.startsWith('ext.') ? id.slice(4) : '';
	if (serverId.length === 0) {
		throw new Error(`Invalid external activation id: "${id}"`);
	}
	const plugins = { ...(config.plugins ?? {}) };
	const external = plugins['external-mcps'] ?? {};
	const options = { ...(external.options ?? {}) };
	const rawServers = options.servers;
	const servers =
		typeof rawServers === 'object' &&
		rawServers !== null &&
		!Array.isArray(rawServers)
			? { ...(rawServers as Record<string, unknown>) }
			: {};
	const rawServer = servers[serverId];
	if (
		typeof rawServer !== 'object' ||
		rawServer === null ||
		Array.isArray(rawServer)
	) {
		throw new Error(`External server "${serverId}" is not configured`);
	}
	servers[serverId] = {
		...(rawServer as Record<string, unknown>),
		enabled: active,
	};
	options.servers = servers;
	plugins['external-mcps'] = { ...external, options };
	return { ...config, plugins };
};

const setNativePluginActivation = (
	config: IDelendaiConfigFile,
	id: string,
	origin: PluginOrigin,
	active: boolean,
): IDelendaiConfigFile => {
	const plugins: Record<string, IDelendaiPluginConfig> = {
		...(config.plugins ?? {}),
	};
	plugins[id] = { ...(plugins[id] ?? {}), enabled: active, origin };
	return { ...config, plugins };
};

export const setPluginActivation = async (
	input: ISetPluginActivationInput,
): Promise<ISetPluginActivationResult> => {
	if (!isAbsolute(input.workspaceRoot)) {
		throw new Error('workspaceRoot must be absolute');
	}
	if (input.id.trim().length === 0) throw new Error('plugin id is required');
	const contained = resolveWorkspaceContained(
		input.workspaceRoot,
		input.configFileName ?? DEFAULT_CONFIG_FILENAME,
	);
	if (!contained.ok) {
		throw new Error(
			`configFileName is not contained in the workspace: ${contained.reason}`,
		);
	}
	const configFile = contained.abs;

	return withFileMutex(configFile, async () => {
		const current = await readConfig(configFile);
		const next =
			input.origin === 'external'
				? setExternalServerActivation(current, input.id, input.active)
				: setNativePluginActivation(
						current,
						input.id,
						input.origin,
						input.active,
					);
		const currentText = `${JSON.stringify(current, null, '\t')}\n`;
		const nextText = `${JSON.stringify(next, null, '\t')}\n`;
		const changed = currentText !== nextText;
		if (changed) await writeFileAtomic(configFile, nextText);
		return {
			configFile,
			id: input.id,
			active: input.active,
			changed,
		};
	});
};
