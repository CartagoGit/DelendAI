/**
 * attribute.spec.ts — split a qualified tool name into {plugin, tool}.
 *
 * The boundary between plugin prefix and tool id cannot be found by a
 * blind split (tool ids carry underscores), so attribution resolves
 * against the live loaded-plugin prefix set. Core tools fall to `core`.
 */
import { describe, expect, it } from 'vitest';

import {
	attributeTool,
	CORE_PLUGIN_KEY,
	deriveCorePrefix,
} from '../../../src/lib/attribute';

describe('deriveCorePrefix', () => {
	it('strips the trailing plugin prefix segment', () => {
		expect(deriveCorePrefix('delendai_usage-tracking')).toBe('delendai');
		expect(deriveCorePrefix('delendai_memory')).toBe('delendai');
	});
});

describe('attributeTool', () => {
	const peers = ['memory', 'usage-tracking', 'status-marker', 'proposals'];

	it('splits a plugin tool whose id contains underscores', () => {
		expect(
			attributeTool(
				'delendai_usage-tracking_usage_report',
				'delendai',
				peers,
			),
		).toEqual({ plugin: 'usage-tracking', tool: 'usage_report' });
	});

	it('splits a single-segment plugin tool', () => {
		expect(
			attributeTool('delendai_memory_save', 'delendai', peers),
		).toEqual({ plugin: 'memory', tool: 'save' });
	});

	it('handles kebab-case plugin prefixes', () => {
		expect(
			attributeTool('delendai_status-marker_close', 'delendai', peers),
		).toEqual({ plugin: 'status-marker', tool: 'close' });
	});

	it('attributes a core tool to the synthetic core plugin', () => {
		expect(
			attributeTool('delendai_get_validation_matrix', 'delendai', peers),
		).toEqual({ plugin: CORE_PLUGIN_KEY, tool: 'get_validation_matrix' });
		expect(attributeTool('delendai_overview', 'delendai', peers)).toEqual({
			plugin: CORE_PLUGIN_KEY,
			tool: 'overview',
		});
	});

	it('prefers the longest matching prefix', () => {
		const overlapping = ['status', 'status-marker'];
		expect(
			attributeTool(
				'delendai_status-marker_ping',
				'delendai',
				overlapping,
			),
		).toEqual({ plugin: 'status-marker', tool: 'ping' });
	});
});
