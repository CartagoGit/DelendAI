import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import z from 'zod';

import type { IToolRegistration } from '../contracts/interfaces/tool-registration.interface';
import type {
	ITerminalCapabilities,
	ITerminalProbeDriver,
} from '../contracts/interfaces/terminal-capabilities.interface';
import { TerminalProbeService } from '../services/shell/terminal-probe.service';
import {
	createToolAvailabilityService,
	type IShellProbeResult,
	type IShellRunner,
	type IToolAvailabilityService,
	type IToolReport,
} from '../services/shell/tool-availability';
import { InstallSuggestionsService } from '../services/shell/install-suggestions';
import { toolJson } from '../shared/tool-response';

const execFile = promisify(execFileCallback);
const DEFAULT_TTL_MS = 30_000;

export const SHELL_STATUS_REGISTRATION_ID = 'shell_status';

export const shellStatusInputSchema = z.object({
	verbose: z.boolean().optional().default(false),
	refresh: z.boolean().optional().default(false),
	names: z.array(z.string().min(1)).optional(),
});

const shellStatusToolSchema = z.object({
	name: z.string(),
	purpose: z.string(),
	availability: z.enum(['present', 'missing', 'unknown']),
	probeStatus: z.enum(['present', 'missing', 'error']),
	path: z.string().nullable(),
	version: z.string().nullable(),
	alternativesAvailable: z.array(z.string()),
	suggestInstall: z
		.object({
			manager: z.string(),
			command: z.string(),
			confirmed: z.literal(false),
			reason: z.string().optional(),
		})
		.nullable(),
});

export const shellStatusOutputSchema = z.object({
	terminal: z.unknown(),
	tools: z.array(shellStatusToolSchema),
	suggestedActions: z.array(z.string()),
	generatedAt: z.number().int().nonnegative(),
	ttlMs: z.number().int().positive(),
});

export interface IShellStatusSnapshot {
	readonly terminal: ITerminalCapabilities;
	readonly tools: readonly IToolReport[];
	readonly suggestedActions: readonly string[];
	readonly generatedAt: number;
	readonly ttlMs: number;
}

export interface IShellStatusToolOptions {
	readonly namespacePrefix: string;
	readonly ttlMs?: number;
	readonly probe?: TerminalProbeService;
	readonly availability?: IToolAvailabilityService;
	readonly now?: () => number;
}

const defaultProbeDriver = (): ITerminalProbeDriver => ({
	runCommand: async (argv, timeoutMs) => {
		try {
			const result = await execFile(argv[0] ?? '', argv.slice(1), {
				encoding: 'utf8',
				timeout: timeoutMs,
				maxBuffer: 1024 * 1024,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: 0,
				timedOut: false,
			};
		} catch (error) {
			const failure = error as NodeJS.ErrnoException & {
				stdout?: string;
				stderr?: string;
				code?: number;
				killed?: boolean;
				signal?: string;
			};
			return {
				stdout: failure.stdout ?? '',
				stderr: failure.stderr ?? failure.message ?? '',
				exitCode:
					typeof failure.code === 'number' ? failure.code : null,
				timedOut:
					failure.killed === true ||
					failure.signal === 'SIGTERM' ||
					failure.code === 'ETIMEDOUT',
			};
		}
	},
});

const defaultShellRunner = (): IShellRunner => ({
	resolveBatch: async (tools, signal) => {
		if (signal.aborted) return [];
		const result = await execFile(
			'/bin/bash',
			[
				'-c',
				'for tool in "$@"; do command -v "$tool" || true; done',
				'--',
				...tools.map((tool) => tool.checkCommand),
			],
			{ encoding: 'utf8', maxBuffer: 1024 * 1024 },
		).catch(() => ({ stdout: '', stderr: '' }));
		const paths = result.stdout.trim().split(/\r?\n/u);
		return tools.map((tool, index): IShellProbeResult => {
			const path = paths[index]?.trim() ?? '';
			return path === ''
				? {
						name: tool.name,
						path: null,
						version: null,
						status: 'missing',
					}
				: { name: tool.name, path, version: null, status: 'present' };
		});
	},
	versionFor: async (path, flag) =>
		(
			await execFile(path, [flag], {
				encoding: 'utf8',
				maxBuffer: 4096,
			}).catch(() => ({ stdout: '' }))
		).stdout.trim() || null,
});

const buildSuggestionRunner =
	() =>
	async (
		command: string,
		args: readonly string[],
	): Promise<{ code: number; output: string }> => {
		try {
			const result = await execFile(command, [...args], {
				encoding: 'utf8',
				maxBuffer: 4096,
			});
			return { code: 0, output: `${result.stdout}${result.stderr}` };
		} catch (error) {
			const failure = error as NodeJS.ErrnoException & {
				stdout?: string;
				stderr?: string;
				code?: number;
			};
			return {
				code: typeof failure.code === 'number' ? failure.code : 1,
				output: `${failure.stdout ?? ''}${failure.stderr ?? failure.message ?? ''}`,
			};
		}
	};

const buildSuggestedActions = (tools: readonly IToolReport[]): string[] =>
	tools
		.filter((tool) => tool.availability !== 'present')
		.map((tool) => {
			const suggestion = tool.suggestInstall;
			if (suggestion?.reason) return `${tool.name}: ${suggestion.reason}`;
			if (suggestion?.command)
				return `${tool.name}: install with ${suggestion.command}`;
			return `${tool.name}: unavailable`;
		});

export const createShellStatusSnapshot = async (
	options: Omit<IShellStatusToolOptions, 'namespacePrefix'> = {},
	input: z.input<typeof shellStatusInputSchema> = {},
): Promise<IShellStatusSnapshot> => {
	const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
	const probe =
		options.probe ?? new TerminalProbeService(defaultProbeDriver());
	const availability =
		options.availability ??
		createToolAvailabilityService({
			runner: defaultShellRunner(),
			suggestInstall: async (entry, alternativesAvailable) =>
				new InstallSuggestionsService({
					workspaceRoot: process.cwd(),
					run: buildSuggestionRunner(),
				}).suggest({
					entry: {
						name: entry.name,
						purpose: entry.purpose,
						versionArgs: [entry.versionFlag],
						alternatives: entry.alternatives,
					},
					alternativesAvailable,
				}),
		});
	const terminal = await probe.probe();
	const controller = new AbortController();
	const listed = await availability.list(
		input.names === undefined ? {} : { names: input.names },
		controller.signal,
	);
	const tools = await availability.attachSuggestions(
		listed.tools,
		controller.signal,
	);
	return {
		terminal,
		tools,
		suggestedActions: buildSuggestedActions(tools),
		generatedAt: (options.now ?? Date.now)(),
		ttlMs,
	};
};

export const buildShellStatusToolRegistration = (
	options: IShellStatusToolOptions,
): IToolRegistration => {
	let cached: IShellStatusSnapshot | null = null;
	let expiresAt = 0;
	return {
		id: SHELL_STATUS_REGISTRATION_ID,
		summary: 'Detect the active shell and available command-line tools.',
		tags: ['orientation', 'shell'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_${SHELL_STATUS_REGISTRATION_ID}`,
				{
					title: 'DelendAI Inspect Shell',
					description:
						'Return cached terminal capabilities, available tools, and safe installation suggestions. Read-only; suggestions are never executed.',
					inputSchema: shellStatusInputSchema,
					outputSchema: shellStatusOutputSchema,
				},
				async (input) => {
					const now = (options.now ?? Date.now)();
					const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
					if (
						input.refresh !== true &&
						cached !== null &&
						expiresAt > now &&
						input.names === undefined
					) {
						return toolJson(cached);
					}
					const snapshot = await createShellStatusSnapshot(
						options,
						input,
					);
					if (input.names === undefined) {
						cached = snapshot;
						expiresAt = now + ttlMs;
					}
					return toolJson(snapshot);
				},
			);
		},
	};
};
