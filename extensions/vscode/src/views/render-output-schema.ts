import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';

export interface IRenderableSchema {
	readonly type?: string;
	readonly description?: string;
	readonly properties?: Record<string, IRenderableSchema>;
	readonly items?: IRenderableSchema;
	readonly enum?: readonly string[];
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean | IRenderableSchema;
}

/**
 * Render a JSON-schema-shaped object as an HTML string. The output
 * uses the `tool-detail` BEM tree (`tool-detail__schema-node`,
 * `tool-detail__schema-type`, `tool-detail__schema-prop`) so the
 * dev preview's shared CSS picks it up without an inline style
 * block.
 */
export const renderOutputSchema = (
	schema: IRenderableSchema,
	copy?: IViewCopy,
): string =>
	`<div class="tool-detail__schema">${renderSchemaNode(schema, copy)}</div>`;

const renderSchemaNode = (
	schema: IRenderableSchema,
	copy?: IViewCopy,
): string => {
	const type = schema.type ?? inferType(schema);
	const description =
		schema.description === undefined
			? ''
			: `<p class="tool-detail__schema-desc">${escapeHtml(schema.description)}</p>`;
	const enumValues =
		schema.enum === undefined
			? ''
			: `<p class="tool-detail__schema-desc">${escapeHtml(copy?.enumLabel ?? 'enum')}: ${schema.enum.map(escapeHtml).join(', ')}</p>`;
	const properties = renderProperties(schema, copy);
	const items =
		schema.items === undefined
			? ''
			: `<div class="tool-detail__schema-node"><strong>${escapeHtml(copy?.items ?? 'items')}</strong>${renderSchemaNode(schema.items, copy)}</div>`;
	return `<div class="tool-detail__schema-node"><span class="tool-detail__schema-type">${escapeHtml(type)}</span>${description}${enumValues}${properties}${items}</div>`;
};

const renderProperties = (
	schema: IRenderableSchema,
	copy?: IViewCopy,
): string => {
	if (schema.properties === undefined) return '';
	const required = new Set(schema.required ?? []);
	const rows = Object.entries(schema.properties)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, child]) => {
			const marker = required.has(name)
				? (copy?.required ?? 'required')
				: (copy?.optional ?? 'optional');
			return `<li class="tool-detail__schema-prop"><strong>${escapeHtml(name)}</strong> <code>${escapeHtml(child.type ?? inferType(child))}</code> <span>${escapeHtml(marker)}</span>${renderSchemaNode(child, copy)}</li>`;
		})
		.join('');
	return `<ul class="tool-detail__schema-props">${rows}</ul>`;
};

const inferType = (schema: IRenderableSchema): string => {
	if (schema.properties !== undefined) return 'object';
	if (schema.items !== undefined) return 'array';
	if (schema.enum !== undefined) return 'enum';
	return 'unknown';
};

export const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
