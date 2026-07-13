import { describe, expect, it } from 'vitest';

import { viewCopyFor } from '../i18n/view-copy.strings';
import { renderAgentCatalogWebview } from '../views/agent-catalog-webview';
import { renderMetricsHtml } from '../views/metrics-sparkline';
import { renderProposalDetailHtml } from '../views/proposal-detail-webview';
import { renderToolDetailHtml } from '../views/tool-detail-webview';

describe('secondary webview content i18n', () => {
	const es = viewCopyFor('es');

	it('renders metrics and catalog chrome in Spanish', () => {
		const metrics = renderMetricsHtml(
			{
				tools: {},
				totals: { calls: 2, errors: 1, totalMs: 0, totalBytes: 0 },
			},
			es,
		);
		expect(metrics).toContain('<html lang="es">');
		expect(metrics).toContain('2 llamadas, 1 error');

		const catalog = renderAgentCatalogWebview({
			bootstrapPrompt: '',
			tools: [],
			skills: [],
			proposals: [],
			copy: es,
		});
		expect(catalog).toContain('Catálogo unificado de agentes');
		expect(catalog).toContain('Copiar prompt de arranque');
	});

	it('renders proposal and tool empty states in Spanish', () => {
		const proposal = renderProposalDetailHtml(
			{ id: 'f00108', logs: [] },
			es,
		);
		expect(proposal).toContain('No hay diagnóstico disponible.');
		expect(proposal).toContain('No hay líneas de registro coincidentes.');

		const tool = renderToolDetailHtml({
			tool: { name: 'demo', plugin: 'demo', tags: [], effects: [] },
			copy: es,
		});
		expect(tool).toContain('No hay esquema de entrada.');
		expect(tool).toContain('No hay llamadas registradas.');
	});
});
