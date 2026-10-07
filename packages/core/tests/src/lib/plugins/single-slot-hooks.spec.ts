import { describe, expect, it } from 'vitest';

import {
	announceSingleSlotContention,
	buildSingleSlotContention,
} from '../../../../src/lib/plugins/single-slot-hooks';

describe('buildSingleSlotContention', () => {
	it('says nothing when a slot has a single claimant', () => {
		expect(
			buildSingleSlotContention([
				{ slot: 'logsSink', pluginName: 'logs' },
				{ slot: 'isAgentStuck', pluginName: 'proposals' },
			]).lines,
		).toEqual([]);
	});

	it('names the winner and every plugin that will never be called', () => {
		// The dropped plugin registers fine, reports no error, exposes its
		// tools — and simply never receives a log line. Nothing failed;
		// something quietly did not happen.
		const lines = buildSingleSlotContention([
			{ slot: 'logsSink', pluginName: 'logs' },
			{ slot: 'logsSink', pluginName: 'observability' },
		]).lines;
		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain('"logs" holds it');
		expect(lines[0]).toContain('"observability"');
		expect(lines[0]).toContain('never be called');
	});

	it('says the rest of the losing plugin still works', () => {
		// Otherwise the reader treats a partial conflict as a broken
		// plugin and starts removing things that were fine.
		const lines = buildSingleSlotContention([
			{ slot: 'isAgentStuck', pluginName: 'proposals' },
			{ slot: 'isAgentStuck', pluginName: 'agent-orchestrator' },
		]).lines;
		expect(lines[0]).toContain('still works');
	});

	it('reports each contended slot separately', () => {
		expect(
			buildSingleSlotContention([
				{ slot: 'logsSink', pluginName: 'a' },
				{ slot: 'logsSink', pluginName: 'b' },
				{ slot: 'isAgentStuck', pluginName: 'c' },
				{ slot: 'isAgentStuck', pluginName: 'd' },
			]).lines,
		).toHaveLength(2);
	});
});

describe('announceSingleSlotContention', () => {
	it('never throws when the writer does', () => {
		expect(() =>
			announceSingleSlotContention(
				buildSingleSlotContention([
					{ slot: 'logsSink', pluginName: 'a' },
					{ slot: 'logsSink', pluginName: 'b' },
				]),
				() => {
					throw new Error('stderr is closed');
				},
			),
		).not.toThrow();
	});
});
