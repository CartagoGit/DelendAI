/**
 * shell-status-defaults.spec.ts — the shell_status snapshot over the real
 * probes, the actions it suggests for tools that are not there, and the
 * handler's cache.
 */
import { describe, expect, it } from 'vitest';

import { createFakeToolServer, fakePartial } from '@delendai/test-kit';

import type { TerminalProbeService } from '@delendai/core/lib/services/shell/terminal-probe.service';
import type { IToolAvailabilityService } from '@delendai/core/lib/services/shell/tool-availability';
import {
	buildShellStatusToolRegistration,
	createShellStatusSnapshot,
} from '@delendai/core/lib/tools/shell-status.tool';

type TTool = Awaited<
	ReturnType<IToolAvailabilityService['list']>
>['tools'][number];

const tool = (name: string, overrides: Partial<TTool> = {}): TTool => ({
	name,
	purpose: 'p',
	availability: 'missing',
	probeStatus: 'missing',
	path: null,
	version: null,
	alternativesAvailable: [],
	suggestInstall: null,
	...overrides,
});

const counting = (tools: readonly TTool[]) => {
	let lists = 0;
	const availability: IToolAvailabilityService = {
		list: async () => {
			lists += 1;
			return { tools: [...tools], generatedAt: 1, ttlMs: 1 };
		},
		attachSuggestions: async (listed) => [...listed],
		invalidate: () => undefined,
		reportFor: async () => null,
	};
	return { availability, lists: () => lists };
};

describe('shell_status over the real probes', () => {
	it('finds git and names the shell, with no fake in between', async () => {
		const snapshot = await createShellStatusSnapshot(
			{ workspaceRoot: process.cwd() },
			{ names: ['git'] },
		);
		expect(
			snapshot.tools.find((each) => each.name === 'git')?.availability,
		).toBe('present');
		expect(snapshot.terminal.shell.name.length).toBeGreaterThan(0);
	});
});

describe('suggested actions', () => {
	it('says how to get each tool that is not there', async () => {
		const { availability } = counting([
			tool('git', { availability: 'present', probeStatus: 'present' }),
			tool('jq', {
				suggestInstall: fakePartial<
					NonNullable<TTool['suggestInstall']>
				>({
					reason: 'use the package manager',
				}),
			}),
			tool('rg', {
				suggestInstall: fakePartial<
					NonNullable<TTool['suggestInstall']>
				>({
					command: 'apt install ripgrep',
				}),
			}),
			tool('fd'),
		]);
		const snapshot = await createShellStatusSnapshot({
			workspaceRoot: process.cwd(),
			probe: fakePartial<TerminalProbeService, 'probe'>({
				probe: async () =>
					fakePartial<
						Awaited<ReturnType<TerminalProbeService['probe']>>
					>({}),
			}),
			availability,
		});
		expect(snapshot.suggestedActions).toEqual([
			'jq: use the package manager',
			'rg: install with apt install ripgrep',
			'fd: unavailable',
		]);
	});
});

describe('shell_status handler', () => {
	it('serves the cached snapshot until refreshed, and never caches a filtered one', async () => {
		const { availability, lists } = counting([tool('git')]);
		let handler:
			| ((input: Record<string, unknown>) => Promise<unknown>)
			| undefined;
		await buildShellStatusToolRegistration({
			namespacePrefix: 'delendai',
			workspaceRoot: process.cwd(),
			probe: fakePartial<TerminalProbeService, 'probe'>({
				probe: async () =>
					fakePartial<
						Awaited<ReturnType<TerminalProbeService['probe']>>
					>({}),
			}),
			availability,
			now: () => 1_000,
			ttlMs: 60_000,
		}).register(
			createFakeToolServer({
				onRegisterTool: (call) => {
					handler = call.handler as typeof handler;
				},
			}),
		);
		await handler?.({});
		await handler?.({});
		expect(lists()).toBe(1);
		await handler?.({ refresh: true });
		expect(lists()).toBe(2);
		await handler?.({ names: ['git'] });
		await handler?.({});
		expect(lists()).toBe(3);
	});
});
