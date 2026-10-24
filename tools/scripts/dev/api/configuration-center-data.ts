import {
	type McpStdioClient,
	readConfigurationDocument,
	saveConfigurationDocument,
	type ConfigurationArtifactKind,
	type IConfigurationArtifact,
	type IConfigurationCenterResult,
	type IConfigurationPlugin,
	type ISaveConfigurationDocumentInput,
} from '@delendai/client/public';
import type { IConfigurationCenterSource } from '@delendai/ui-extension/public';

import { invalidateClient, leaseClient } from './client-pool';

const configurationTool = async (client: McpStdioClient): Promise<string> => {
	const names = (await client.listTools()).map((tool) => tool.name);
	const exact = names.find(
		(name) => name === 'delendai_configuration_center',
	);
	const discovered =
		exact ?? names.find((name) => name.endsWith('_configuration_center'));
	if (discovered === undefined) {
		throw new Error(
			'The MCP server does not advertise configuration_center.',
		);
	}
	return discovered;
};

const readAll = async <T>(
	client: McpStdioClient,
	tool: string,
	section: 'plugins' | 'artifacts',
	select: (page: IConfigurationCenterResult) => readonly T[] | undefined,
): Promise<readonly T[]> => {
	const entries: T[] = [];
	const seen = new Set<number>();
	let cursor = 0;
	for (;;) {
		if (seen.has(cursor))
			throw new Error(`repeated ${section} cursor ${cursor}`);
		seen.add(cursor);
		const page = await client.request<
			{ section: typeof section; cursor: number; limit: number },
			IConfigurationCenterResult
		>(tool, { section, cursor, limit: 100 });
		entries.push(...(select(page) ?? []));
		if (page.page.nextCursor === null) return entries;
		cursor = page.page.nextCursor;
	}
};

// x00100 S1: reuse the shared per-cwd client (see client-pool.ts) —
// spawning a fresh host per request made every section switch pay a
// full plugin boot. On failure invalidate and retry once fresh.
export const fetchConfigurationCenterData = async (
	workspaceRoot: string,
): Promise<IConfigurationCenterSource> => {
	try {
		return await fetchConfigurationCenterOnce(workspaceRoot);
	} catch {
		await invalidateClient(workspaceRoot);
		return await fetchConfigurationCenterOnce(workspaceRoot);
	}
};

const fetchConfigurationCenterOnce = async (
	workspaceRoot: string,
): Promise<IConfigurationCenterSource> => {
	const client = await leaseClient(workspaceRoot);
	{
		const tool = await configurationTool(client);
		const [document, config, summary, plugins, artifacts] =
			await Promise.all([
				readConfigurationDocument({ workspaceRoot }),
				client.request<
					{ section: 'config' },
					IConfigurationCenterResult
				>(tool, {
					section: 'config',
				}),
				client.request<
					{ section: 'summary' },
					IConfigurationCenterResult
				>(tool, {
					section: 'summary',
				}),
				readAll<IConfigurationPlugin>(
					client,
					tool,
					'plugins',
					(page) => page.plugins,
				),
				readAll<IConfigurationArtifact>(
					client,
					tool,
					'artifacts',
					(page) => page.artifacts,
				),
			]);
		if (config.configSchema === undefined) {
			throw new Error('configuration schema is unavailable');
		}
		return {
			document,
			configSchema: config.configSchema,
			plugins,
			artifacts,
			unavailableArtifactKinds:
				summary.summary?.unavailableArtifactKinds ??
				([] as readonly ConfigurationArtifactKind[]),
		};
	}
};

export type IConfigurationCenterSaveRequest = Omit<
	ISaveConfigurationDocumentInput,
	'workspaceRoot'
>;

export const isConfigurationCenterSaveRequest = (
	value: unknown,
): value is IConfigurationCenterSaveRequest => {
	if (value === null || typeof value !== 'object' || Array.isArray(value))
		return false;
	const record = value as Record<string, unknown>;
	if (
		Object.keys(record).some(
			(key) => key !== 'expectedDigest' && key !== 'edits',
		)
	)
		return false;
	if (
		typeof record.expectedDigest !== 'string' ||
		record.expectedDigest.length > 128
	)
		return false;
	if (!Array.isArray(record.edits) || record.edits.length > 256) return false;
	return record.edits.every((edit) => {
		if (edit === null || typeof edit !== 'object' || Array.isArray(edit))
			return false;
		const entry = edit as Record<string, unknown>;
		if (entry.action !== 'set' && entry.action !== 'delete') return false;
		if (
			!Array.isArray(entry.path) ||
			entry.path.length === 0 ||
			entry.path.length > 32
		)
			return false;
		if (
			!entry.path.every(
				(segment) =>
					(typeof segment === 'string' &&
						segment.length > 0 &&
						segment.length <= 256) ||
					(Number.isSafeInteger(segment) && Number(segment) >= 0),
			)
		)
			return false;
		const allowed =
			entry.action === 'set'
				? ['action', 'path', 'value']
				: ['action', 'path'];
		return (
			Object.keys(entry).every((key) => allowed.includes(key)) &&
			(entry.action !== 'set' || 'value' in entry)
		);
	});
};

export const saveConfigurationCenterData = async (
	workspaceRoot: string,
	request: IConfigurationCenterSaveRequest,
) => saveConfigurationDocument({ workspaceRoot, ...request });
