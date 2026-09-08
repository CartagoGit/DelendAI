import { describe, expect, it } from 'vitest';

import type {
	ITerminalCapabilities,
	ITerminalProbeDriver,
} from '../contracts/interfaces/terminal-capabilities.interface';
import {
	buildShellStatusToolRegistration,
	createShellStatusSnapshot,
	shellStatusInputSchema,
} from './shell-status.tool';
import type { IToolAvailabilityService } from '../services/shell/tool-availability';

const terminal: ITerminalCapabilities = {
	shell: {
		path: '/bin/bash',
		name: 'bash',
		version: '5.2',
		isLogin: false,
		isInteractive: false,
		initScriptsLoad: false,
		confidence: 'measured',
	},
	supports: {
		pipes: true,
		heredoc: true,
		commandSubstitution: true,
		arrays: true,
		doubleBracket: true,
		pipefail: true,
		processSubstitution: true,
		timeout: true,
		stdbuf: true,
		ansiColor: true,
		confidence: 'measured',
	},
	invocation: {
		safeModes: ['sync', 'async'],
		paged: false,
		pagers: [],
		recommends: {
			useBashExplicit: false,
			noPagerFlags: [],
			envOverrides: {},
			confidence: 'inferred',
		},
	},
	probeMs: 1,
	generatedAt: new Date(0).toISOString(),
};

const probeDriver: ITerminalProbeDriver = {
	runCommand: () => ({ stdout: '', stderr: '', exitCode: 0, timedOut: false }),
};

const availability: IToolAvailabilityService = {
	list: async () => ({
		tools: [
			{
				name: 'git',
				purpose: 'source control',
				availability: 'present' as const,
				probeStatus: 'present' as const,
				path: '/usr/bin/git',
				version: 'git version 2',
				alternativesAvailable: [],
				suggestInstall: null,
			},
		],
		generatedAt: 10,
		ttlMs: 30_000,
	}),
	attachSuggestions: async (tools) => [...tools],
		invalidate: () => undefined,
		reportFor: async () => null,
};

const fakeProbe = {
	probe: async () => terminal,
} as unknown as import('../services/shell/terminal-probe.service').TerminalProbeService;

describe('shell_status tool', () => {
	it('accepts compact, refresh, and tool-name filters', () => {
		expect(shellStatusInputSchema.parse({})).toEqual({
			verbose: false,
			refresh: false,
		});
		expect(shellStatusInputSchema.parse({ names: ['git'], refresh: true })).toEqual({
			verbose: false,
			refresh: true,
			names: ['git'],
		});
	});

	it('combines terminal capabilities and tool availability', async () => {
		const snapshot = await createShellStatusSnapshot({
			probe: fakeProbe,
			availability,
			now: () => 42,
		});
		expect(snapshot.terminal.shell.name).toBe('bash');
		expect(snapshot.tools[0]?.name).toBe('git');
		expect(snapshot.generatedAt).toBe(42);
		expect(snapshot.suggestedActions).toEqual([]);
	});

	it('declares the orientation registration', () => {
		const registration = buildShellStatusToolRegistration({
			namespacePrefix: 'delendai',
		});
		expect(registration.id).toBe('shell_status');
		expect(registration.tags).toEqual(['orientation', 'shell']);
	});
});