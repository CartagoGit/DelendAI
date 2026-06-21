export interface IRenderableSchema {
	readonly type?: string;
	readonly description?: string;
	readonly properties?: Record<string, IRenderableSchema>;
	readonly items?: IRenderableSchema;
	readonly enum?: readonly string[];
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean | IRenderableSchema;
}

export const renderOutputSchema = (schema: IRenderableSchema): string =>
	`<section class="schema">${renderSchemaNode(schema)}</section>`;

const renderSchemaNode = (schema: IRenderableSchema): string => {
	const type = schema.type ?? inferType(schema);
	const description =
		schema.description === undefined
			? ''
			: `<p>${escapeHtml(schema.description)}</p>`;
	const enumValues =
		schema.enum === undefined
			? ''
			: `<p>enum: ${schema.enum.map(escapeHtml).join(', ')}</p>`;
	const properties = renderProperties(schema);
	const items =
		schema.items === undefined
			? ''
			: `<div class="schema__items"><strong>items</strong>${renderSchemaNode(schema.items)}</div>`;
	return `<div class="schema__node"><code>${escapeHtml(type)}</code>${description}${enumValues}${properties}${items}</div>`;
};

const renderProperties = (schema: IRenderableSchema): string => {
	if (schema.properties === undefined) return '';
	const required = new Set(schema.required ?? []);
	const rows = Object.entries(schema.properties)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([name, child]) => {
			const marker = required.has(name) ? 'required' : 'optional';
			return `<li><strong>${escapeHtml(name)}</strong> <span>${marker}</span>${renderSchemaNode(child)}</li>`;
		})
		.join('');
	return `<ul class="schema__props">${rows}</ul>`;
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
