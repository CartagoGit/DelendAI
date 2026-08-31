import { describe, expect, it } from 'vitest';
import type { IToolDescriptor } from '@mcp-vertex/client';
import {
	DEFAULT_TOOL_DETAIL_COPY,
	renderToolDetailBody,
	renderToolDetailHtml,
} from '../../src/dashboard/render-tool-detail';

const TOOL: IToolDescriptor = {
	name: 'mcp-vertex_demo_tool',
	plugin: 'demo',
	summary: 'Demonstrates the shared tool detail renderer.',
	tags: ['demo'],
	effects: [],
};

describe('renderToolDetail (shared)', () => {
	it('falls back to English copy when no copy is supplied', () => {
		const html = renderToolDetailHtml({ tool: TOOL });
		expect(html).toContain(DEFAULT_TOOL_DETAIL_COPY.inputSchema);
		expect(html).toContain(DEFAULT_TOOL_DETAIL_COPY.outputSchema);
		expect(html).toContain('lang="en"');
	});

	it('emits body fragment for shell mounting', () => {
		const html = renderToolDetailBody({
			tool: TOOL,
			inputSchema: {
				type: 'object',
				properties: { name: { type: 'string' } },
				required: ['name'],
			},
			copy: {
				...DEFAULT_TOOL_DETAIL_COPY,
				lang: 'es',
				inputSchema: 'Esquema de entrada',
				required: 'obligatorio',
			},
		});
		expect(html).toContain('tool-detail__section');
		expect(html).toContain('Esquema de entrada');
		expect(html).toContain('obligatorio');
	});

	it('renders metric counts and labels through the supplied copy', () => {
		const html = renderToolDetailBody({
			tool: TOOL,
			metrics: {
				tools: {
					[TOOL.name]: {
						calls: 2,
						errors: 0,
						totalMs: 50,
						maxMs: 30,
						avgMs: 25,
						totalBytes: 0,
						tokens: 0,
					},
				},
			},
			copy: {
				...DEFAULT_TOOL_DETAIL_COPY,
				callSingular: 'llamada',
				errors: 'errores',
				max: 'máx',
			},
		});
		expect(html).toContain('2 llamada');
		expect(html).toContain('0 errores');
		expect(html).toContain('máx 30ms');
	});

	it('escapes unsafe tool metadata', () => {
		const html = renderToolDetailHtml({
			tool: {
				...TOOL,
				name: '<script>',
				summary: 'summary <x>',
			},
		});
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('summary &lt;x&gt;');
	});
});
