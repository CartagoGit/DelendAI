import type { IDashboardAllModels } from '@mcp-vertex/client';
import { renderHeaderBar } from '../../components';
import { escapeHtml } from '../format';

export function buildHeader(model: IDashboardAllModels): string {
	return renderHeaderBar({
		brandName: 'mcp-vertex',
		version: `${escapeHtml(model.server.version)} · ${escapeHtml(model.server.name)}`,
	});
}
