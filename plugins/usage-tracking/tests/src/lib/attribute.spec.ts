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
		expect(deriveCorePrefix('mcp-vertex_usage-tracking')).toBe(
			'mcp-vertex',
		);
		expect(deriveCorePrefix('mcp-vertex_memory')).toBe('mcp-vertex');
	});
});

describe('attributeTool', () => {
	const peers = ['memory', 'usage-tracking', 'status-marker', 'proposals'];

	it('splits a plugin tool whose id contains underscores', () => {
		expect(
			attributeTool(
				'mcp-vertex_usage-tracking_usage_report',
				'mcp-vertex',
				peers,
			),
		).toEqual({ plugin: 'usage-tracking', tool: 'usage_report' });
	});

	it('splits a single-segment plugin tool', () => {
		expect(
			attributeTool('mcp-vertex_memory_save', 'mcp-vertex', peers),
		).toEqual({ plugin: 'memory', tool: 'save' });
	});

	it('handles kebab-case plugin prefixes', () => {
		expect(
			attributeTool(
				'mcp-vertex_status-marker_close',
				'mcp-vertex',
				peers,
			),
		).toEqual({ plugin: 'status-marker', tool: 'close' });
	});

	it('attributes a core tool to the synthetic core plugin', () => {
		expect(
			attributeTool(
				'mcp-vertex_get_validation_matrix',
				'mcp-vertex',
				peers,
			),
		).toEqual({ plugin: CORE_PLUGIN_KEY, tool: 'get_validation_matrix' });
		expect(
			attributeTool('mcp-vertex_overview', 'mcp-vertex', peers),
		).toEqual({ plugin: CORE_PLUGIN_KEY, tool: 'overview' });
	});

	it('prefers the longest matching prefix', () => {
		const overlapping = ['status', 'status-marker'];
		expect(
			attributeTool(
				'mcp-vertex_status-marker_ping',
				'mcp-vertex',
				overlapping,
			),
		).toEqual({ plugin: 'status-marker', tool: 'ping' });
	});
});
