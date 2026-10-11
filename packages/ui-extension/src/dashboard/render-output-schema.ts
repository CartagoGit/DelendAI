/**
 * `renderOutputSchema` — host-agnostic JSON-schema projection as HTML.
 *
 * Mirrors the legacy `extensions/vscode/src/views/render-output-schema.ts`
 * implementation, with two important differences:
 *
 *  - Copy is sourced from `IToolDetailCopy`, not from the extension's
 *    `IViewCopy`; this keeps the renderer free of VS Code vocabulary.
 *  - Optional `renderOutputSchemaBEM(...)` returns markup using the
 *    `tool-detail__schema-*` BEM tree the dev preview mounts, so the
 *    shared preview can render schemas without an inline `<style>`
 *    block.
 */
import type { IRenderableSchema } from '../contracts/interfaces/renderable-schema.interface';
import type { IToolDetailCopy } from '../contracts/interfaces/tool-detail.interface';

const inferType = (schema: IRenderableSchema): string => {
	if (schema.properties !== undefined) return 'object';
	if (schema.items !== undefined) return 'array';
	if (schema.enum !== undefined) return 'enum';
	return 'unknown';
};

const renderSchemaNode = (
	schema: IRenderableSchema,
	copy: IToolDetailCopy,
): string => {
	const type = schema.type ?? inferType(schema);
	const description =
		schema.description === undefined
			? ''
			: `<p class="tool-detail__schema-desc">${escapeHtml(schema.description)}</p>`;
	const enumValues =
		schema.enum === undefined
			? ''
			: `<p class="tool-detail__schema-desc">${escapeHtml(copy.enumLabel)}: ${schema.enum.map(escapeHtml).join(', ')}</p>`;
	const properties = renderProperties(schema, copy);
	const items =
		schema.items === undefined
			? ''
			: `<div class="tool-detail__schema-node"><strong>${escapeHtml(copy.items)}</strong>${renderSchemaNode(schema.items, copy)}</div>`;
	return `<div class="tool-detail__schema-node"><span class="tool-detail__schema-type">${escapeHtml(type)}</span>${description}${enumValues}${properties}${items}</div>`;
};

const renderProperties = (
	schema: IRenderableSchema,
	copy: IToolDetailCopy,
): string => {
	if (schema.properties === undefined) return '';
	const required = new Set(schema.required ?? []);
	const rows = Object.entries(schema.properties)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, child]) => {
			const marker = required.has(name) ? copy.required : copy.optional;
			return `<li class="tool-detail__schema-prop"><strong>${escapeHtml(name)}</strong> <code>${escapeHtml(child.type ?? inferType(child))}</code> <span>${escapeHtml(marker)}</span>${renderSchemaNode(child, copy)}</li>`;
		})
		.join('');
	return `<ul class="tool-detail__schema-props">${rows}</ul>`;
};

export const renderOutputSchema = (
	schema: IRenderableSchema,
	copy: IToolDetailCopy,
): string =>
	`<div class="tool-detail__schema">${renderSchemaNode(schema, copy)}</div>`;

export const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
