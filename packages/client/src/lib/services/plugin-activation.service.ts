/**
 * Durable, merge-aware config mutation for the IDE plugin switchboard.
 * Host-neutral: VS Code chooses a row; this service owns the config shape,
 * locking and atomic persistence so every future host can reuse it.
 */
import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import {
	DEFAULT_CONFIG_FILENAME,
	type IMcpVertexConfigFile,
	type IMcpVertexPluginConfig,
	type PluginOrigin,
	parseConfigFile,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';
import type {
	ISetPluginActivationInput,
	ISetPluginActivationResult,
} from '../contracts/interfaces/plugin-activation.interface';

const readConfig = async (
	configFile: string,
): Promise<IMcpVertexConfigFile> => {
	try {
		return parseConfigFile(await readFile(configFile, 'utf8'));
	} catch {
		return {};
	}
};

const setExternalServerActivation = (
	config: IMcpVertexConfigFile,
	id: string,
	active: boolean,
): IMcpVertexConfigFile => {
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
	config: IMcpVertexConfigFile,
	id: string,
	origin: PluginOrigin,
	active: boolean,
): IMcpVertexConfigFile => {
	const plugins: Record<string, IMcpVertexPluginConfig> = {
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
	const configFile = join(
		input.workspaceRoot,
		input.configFileName ?? DEFAULT_CONFIG_FILENAME,
	);

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
