/**
 * `renderPluginBadge` — small inline-SVG logo + name combo for the
 * settings/dashboard. Uses the brand mark SVGs from
 * `@mcp-vertex/shared/components/ui/brand-icons` for the official
 * third-party logos (GitHub, GitLab, Remote provider) and a
 * generated initials fallback for everything else.
 */
import type { ILangDict } from '@mcp-vertex/shared/i18n';

import { renderBrandIcon } from './brand-icons';

const INITIALS_FALLBACK = (label: string): string => {
	const cleaned = label.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
	const words = cleaned.split(/\s+/).slice(0, 2);
	if (words.length === 0) return 'M';
	return words.map((word) => word.charAt(0).toUpperCase()).join('');
};

export interface IRenderPluginBadgeOptions {
	readonly code: string;
	readonly label: string;
	readonly title?: string;
	readonly size?: number;
	readonly lang?: ILangDict;
	readonly fallbackColour?: string;
}

const TITLE_TEXT = (title: string | undefined, label: string): string =>
	title ?? label;

export const renderPluginBadge = (
	options: IRenderPluginBadgeOptions,
): string => {
	const size = options.size ?? 24;
	const brand = renderBrandIcon(options.code);
	const title = TITLE_TEXT(options.title, options.label);
	if (brand.length > 0) {
		return `<span class="mcpv-badge mcpv-badge--brand" data-code="${options.code}" title="${title.replace(/"/g, '&quot;')}" style="--mcpv-badge-size:${size}px">${brand}</span>`;
	}
	const initials = INITIALS_FALLBACK(options.label);
	const colour = options.fallbackColour ?? 'var(--mcpv-brand-blue)';
	return `<span class="mcpv-badge mcpv-badge--initials" data-code="${options.code}" title="${title.replace(/"/g, '&quot;')}" style="--mcpv-badge-size:${size}px;background:${colour}">${initials}</span>`;
};
