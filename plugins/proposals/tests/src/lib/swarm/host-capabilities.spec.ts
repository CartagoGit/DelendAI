/**
 * host-capabilities.spec.ts
 *
 * r00003 S8 (F3, O + D) — pin the SOLID contract of the host
 * capabilities abstraction. Before this split, the reminder module
 * hardcoded "VS Code 1.123 / Copilot Chat 0.43" in three places;
 * any new host release that registered the rename action would have
 * required editing the reminder code. With `IHostCapabilities` the
 * same module is data-driven and the only place to edit is the
 * capability object.
 */

import { describe, expect, it } from 'vitest';

import {
	GENERIC_IDE_CAPABILITIES,
	VSCODE_COPILOT_043_CAPABILITIES,
	createDefaultHostCapabilities,
} from '@mcp-vertex/proposals/lib/swarm/host-capabilities';
import type { IHostCapabilities } from '@mcp-vertex/proposals/lib/swarm/host-capabilities';

import { buildChatTitlingReminder } from '@mcp-vertex/proposals/lib/swarm/chat-titling-reminder';

const makeReport = (
	overrides: Record<string, unknown> = {},
): Parameters<typeof buildChatTitlingReminder>[0] => ({
	agentName: 'forza_motorsport_2023',
	agentSlot: 'implementation_runner',
	model: 'MiniMax-M3',
	selfReview: 'pass',
	filesReRead: 1,
	reviewEvidence: ['vitest run'],
	...overrides,
});

describe('host-capabilities — default factory', async () => {
	it('returns the GENERIC IDE capabilities by default (r00003 S8: no vendor leak)', async () => {
		// The plugin is host-agnostic: an orchestrator that has not
		// registered ctx.options.hostCapabilities must get the generic
		// set, never the VS Code / Copilot one.
		const caps = createDefaultHostCapabilities();
		expect(caps).toEqual(GENERIC_IDE_CAPABILITIES);
		expect(caps).not.toEqual(VSCODE_COPILOT_043_CAPABILITIES);
	});

	it('does not leak host names into the generic capability', async () => {
		const caps = GENERIC_IDE_CAPABILITIES;
		expect(caps.ideDisplayName.toLowerCase()).not.toContain('vs code');
		expect(caps.ideDisplayName.toLowerCase()).not.toContain('copilot');
	});
});

describe('buildChatTitlingReminder — host-capability injection (SOLID D)', async () => {
	it('renders GENERIC prose with NO host name leak when no options are passed', async () => {
		// r00003 S8 (F3): the default config must not mention any IDE or
		// host release number.
		const reminder = buildChatTitlingReminder(makeReport());
		expect(reminder).toContain('the IDE sidebar');
		expect(reminder).toContain('right-click the chat tab → **Rename**');
		expect(reminder).not.toContain('VS Code');
		expect(reminder).not.toContain('Copilot');
		expect(reminder).not.toContain('1.123');
		expect(reminder).not.toContain('0.43');
	});

	it('renders the VS Code prose only when VS Code capabilities are explicitly injected', async () => {
		const reminder = buildChatTitlingReminder(makeReport(), {
			hostCapabilities: VSCODE_COPILOT_043_CAPABILITIES,
		});
		expect(reminder).toContain('VS Code sidebar');
		expect(reminder).toContain('right-click the editor tab → **Rename**');
	});

	it('renders the GENERIC prose when generic capabilities are injected (no host leak)', async () => {
		const reminder = buildChatTitlingReminder(makeReport(), {
			hostCapabilities: GENERIC_IDE_CAPABILITIES,
		});
		expect(reminder).toContain('the IDE sidebar');
		expect(reminder).toContain('right-click the chat tab → **Rename**');
		// No host name leak.
		expect(reminder).not.toContain('VS Code');
		expect(reminder).not.toContain('Copilot');
	});

	it('honours a custom ideDisplayName (e.g. Cursor)', async () => {
		const cursorCaps: IHostCapabilities = {
			...VSCODE_COPILOT_043_CAPABILITIES,
			ideDisplayName: 'Cursor',
			chatPanelLocation: 'panel',
			manualRenameInstruction: 'double-click the chat title',
			programmaticRenameBlockedReason: 'not registered in Cursor 0.42',
		};
		const reminder = buildChatTitlingReminder(makeReport(), {
			hostCapabilities: cursorCaps,
		});
		expect(reminder).toContain('Cursor panel');
		expect(reminder).toContain('double-click the chat title');
		expect(reminder).not.toContain('VS Code sidebar');
		expect(reminder).not.toContain('not registered in VS Code');
	});

	it('omits the workaround paragraph when the host exposes a programmatic rename action', async () => {
		// A future Copilot Chat release that registers the action. The
		// reminder should switch branches entirely.
		const futureCaps: IHostCapabilities = {
			...VSCODE_COPILOT_043_CAPABILITIES,
			programmaticRenameActionId: 'workbench.action.chat.rename',
			programmaticRenameBlockedReason: null,
		};
		const reminder = buildChatTitlingReminder(makeReport(), {
			hostCapabilities: futureCaps,
		});
		expect(reminder).not.toContain('not registered');
		expect(reminder).toContain('workbench.action.chat.rename');
	});

	it('honours a custom prefix char cap (e.g. 60 for an IDE with a wider sidebar)', async () => {
		const widerCaps: IHostCapabilities = {
			...VSCODE_COPILOT_043_CAPABILITIES,
			prefixCharCap: 60,
		};
		const reminder = buildChatTitlingReminder(makeReport(), {
			hostCapabilities: widerCaps,
		});
		expect(reminder).toContain('60 characters');
		expect(reminder).not.toContain('40 characters');
	});
});
