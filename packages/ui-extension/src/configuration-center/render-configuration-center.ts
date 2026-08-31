import { escapeHtml } from '../dashboard/format';
import type {
	ConfigurationCenterTab,
	IConfigurationArtifactModel,
	IConfigurationCenterModel,
	IConfigurationField,
	IConfigurationPluginModel,
	IRenderConfigurationCenterOptions,
} from '../contracts/interfaces/configuration-center.interface';
import { configurationCenterCss } from './configuration-center-css';
import { containsRedactedValue } from './configuration-center-fields';
import { configurationCenterScript } from './configuration-center-script';

const attr = (value: string): string => escapeHtml(value);
const pathAttr = (field: IConfigurationField): string =>
	attr(JSON.stringify(field.path));
const stringValue = (value: unknown): string =>
	value === undefined || value === null ? '' : String(value);
const jsonValue = (value: unknown): string =>
	JSON.stringify(value ?? null, null, 2);

const fieldControl = (field: IConfigurationField): string => {
	const common = `class="mcpv-config__control" id="${attr(field.id)}" data-config-path="${pathAttr(field)}" data-config-kind="${attr(field.kind)}"${field.required ? ' required' : ' data-config-optional="true"'}${field.readOnly || field.kind === 'unsupported' ? ' readonly' : ''}`;
	if (field.kind === 'boolean') {
		return `<label class="mcpv-config__checkbox"><input id="${attr(field.id)}" type="checkbox" data-config-path="${pathAttr(field)}" data-config-kind="boolean"${field.value === true ? ' checked' : ''}${field.readOnly ? ' disabled' : ''} /> <span>${attr(field.label)}</span></label>`;
	}
	if (field.kind === 'select') {
		return `<select ${common}>${(field.choices ?? [])
			.map(
				(choice) =>
					`<option value="${attr(choice)}"${choice === field.value ? ' selected' : ''}>${attr(choice)}</option>`,
			)
			.join('')}</select>`;
	}
	if (field.kind === 'json' || field.kind === 'unsupported') {
		return `<textarea ${common} spellcheck="false">${attr(jsonValue(field.value))}</textarea>`;
	}
	return `<input ${common} type="${field.kind === 'number' ? 'number' : 'text'}" value="${attr(stringValue(field.value))}" />`;
};

const renderField = (
	field: IConfigurationField,
	model: IConfigurationCenterModel,
): string => {
	const boolean = field.kind === 'boolean';
	const hint = field.readOnly
		? model.copy.redacted
		: field.kind === 'unsupported'
			? model.copy.unsupportedField
			: field.description;
	return `<div class="mcpv-config__field" data-invalid="false">
		${
			boolean
				? ''
				: `<label class="mcpv-config__field-label" for="${attr(field.id)}">${attr(field.label)}${field.required ? '<span class="mcpv-config__required" aria-hidden="true">*</span>' : ''}${!field.known ? `<span class="mcpv-config__badge">${attr(model.copy.custom)}</span>` : ''}</label>`
		}
		${hint === undefined ? '' : `<p class="mcpv-config__description">${attr(hint)}</p>`}
		${fieldControl(field)}
		<p class="mcpv-config__field-error" role="alert">${attr(model.copy.invalid)}</p>
	</div>`;
};

const renderFields = (
	fields: readonly IConfigurationField[],
	model: IConfigurationCenterModel,
): string =>
	fields.length === 0
		? `<p class="mcpv-config__empty">${attr(model.copy.empty)}</p>`
		: fields.map((field) => renderField(field, model)).join('');

const originLabel = (
	origin:
		| IConfigurationPluginModel['origin']
		| IConfigurationArtifactModel['owner']['origin'],
	model: IConfigurationCenterModel,
): string =>
	origin === 'bundled'
		? model.copy.bundled
		: origin === 'user-local'
			? model.copy.userLocal
			: origin === 'external'
				? model.copy.external
				: model.copy.unknownOwner;

const builtinPluginFields = (
	plugin: IConfigurationPluginModel,
	model: IConfigurationCenterModel,
): readonly IConfigurationField[] => {
	const externalServerId = plugin.id.startsWith('ext.')
		? plugin.id.slice(4)
		: undefined;
	const enabledPath =
		externalServerId === undefined
			? ['plugins', plugin.id, 'enabled']
			: [
					'plugins',
					'external-mcps',
					'options',
					'servers',
					externalServerId,
					'enabled',
				];
	const fields: IConfigurationField[] = [
		{
			id: `field-plugin-${plugin.id}-enabled`,
			path: enabledPath,
			label: model.copy.enabled,
			description: model.copy.enabledDescription,
			kind: 'boolean',
			value: plugin.active,
			required: false,
			readOnly: false,
			known: true,
		},
	];
	if (externalServerId !== undefined) return fields;
	fields.push({
		id: `field-plugin-${plugin.id}-path`,
		path: ['plugins', plugin.id, 'path'],
		label: model.copy.path,
		description: model.copy.pathDescription,
		kind: 'text',
		value: plugin.path,
		required: false,
		readOnly: false,
		known: true,
	});
	fields.push({
		id: `field-plugin-${plugin.id}-prefix`,
		path: ['plugins', plugin.id, 'prefix'],
		label: model.copy.prefix,
		description: model.copy.prefixDescription,
		kind: 'text',
		value: plugin.prefix,
		required: false,
		readOnly: false,
		known: true,
	});
	return fields;
};

const opaqueOptionsField = (
	plugin: IConfigurationPluginModel,
	model: IConfigurationCenterModel,
): IConfigurationField => ({
	id: `field-plugin-${plugin.id}-options`,
	path: ['plugins', plugin.id, 'options'],
	label: model.copy.options,
	...(plugin.schemaStatus === 'unavailable'
		? {}
		: { description: model.copy.pluginOptionsDescription }),
	kind: 'json',
	value: plugin.options,
	required: false,
	readOnly: containsRedactedValue(plugin.options),
	known: false,
});

const renderPlugin = (
	plugin: IConfigurationPluginModel,
	model: IConfigurationCenterModel,
	highlightPluginId?: string,
): string => {
	const fields = [
		...builtinPluginFields(plugin, model),
		...(plugin.fields.length > 0
			? plugin.fields
			: [opaqueOptionsField(plugin, model)]),
	];
	const highlighted =
		highlightPluginId !== undefined && highlightPluginId === plugin.id;
	return `<article class="mcpv-config__card${highlighted ? ' mcpv-config__card--highlight' : ''}" data-config-search-text="${attr(`${plugin.id} ${plugin.origin} ${plugin.source}`)}" id="${attr(`config-plugin-${plugin.id}`)}">
		<header class="mcpv-config__card-head">
			<div><h3 class="mcpv-config__card-title">${attr(plugin.id)}</h3><p class="mcpv-config__card-meta">${plugin.capabilities.tools} ${attr(model.copy.capabilityTools)} · ${plugin.capabilities.prompts} ${attr(model.copy.capabilityPrompts)} · ${plugin.capabilities.resources} ${attr(model.copy.capabilityResources)}</p></div>
			<div class="mcpv-config__badges"><span class="mcpv-config__badge">${attr(originLabel(plugin.origin, model))}</span><span class="mcpv-config__badge mcpv-config__badge--${plugin.active ? 'active' : 'inactive'}">${attr(plugin.active ? model.copy.active : model.copy.inactive)}</span></div>
		</header>
		${plugin.schemaStatus === 'unavailable' ? `<p class="mcpv-config__notice">${attr(model.copy.schemaUnavailable)}</p>` : ''}
		${renderFields(fields, model)}
	</article>`;
};

const renderArtifact = (
	artifact: IConfigurationArtifactModel,
	model: IConfigurationCenterModel,
): string => `<div class="mcpv-config__artifact" data-config-search-text="${attr(`${artifact.id} ${artifact.ownerLabel} ${artifact.owner.origin}`)}">
	<span class="mcpv-config__artifact-id">${attr(artifact.id)}</span>
	<span class="mcpv-config__badges"><span class="mcpv-config__badge">${attr(artifact.ownerLabel)}</span><span class="mcpv-config__badge">${attr(originLabel(artifact.owner.origin, model))}</span></span>
</div>`;

const panel = (
	id: ConfigurationCenterTab,
	title: string,
	body: string,
	model: IConfigurationCenterModel,
): string =>
	`<section class="mcpv-config__panel" id="config-panel-${id}" role="tabpanel" aria-labelledby="config-tab-${id}" data-config-panel="${id}"${model.activeTab === id ? '' : ' hidden'}><h2 class="mcpv-config__panel-title">${attr(title)}</h2>${body}</section>`;

const banner = (model: IConfigurationCenterModel): string => {
	if (model.state === 'conflict') {
		return `<p class="mcpv-config__banner mcpv-config__banner--conflict" role="alert">${attr(model.copy.conflict)}</p>`;
	}
	if (model.state === 'invalid' || model.issues.length > 0) {
		const details = model.issues
			.map(
				(issue) =>
					`${issue.path.map(String).join('.')}: ${issue.message}`,
			)
			.join(' · ');
		return `<p class="mcpv-config__banner mcpv-config__banner--invalid" role="alert">${attr(details || model.copy.invalid)}</p>`;
	}
	return '';
};

export const renderConfigurationCenter = (
	options: IRenderConfigurationCenterOptions,
): string => {
	const { model } = options;
	const nonce =
		options.nonce === undefined ? '' : ` nonce="${attr(options.nonce)}"`;
	const pluginBody =
		model.plugins.length === 0
			? `<p class="mcpv-config__empty">${attr(model.copy.empty)}</p>`
			: `<div class="mcpv-config__grid">${model.plugins
					.map((entry) =>
						renderPlugin(entry, model, options.pluginId),
					)
					.join('')}</div>`;
	const providerBody =
		model.providers.length === 0
			? `<p class="mcpv-config__empty">${attr(model.copy.empty)}</p>`
			: `<div class="mcpv-config__grid">${model.providers
					.map(
						(provider) =>
							`<article class="mcpv-config__card" data-config-search-text="${attr(`${provider.id} ${provider.kind} ${provider.modelId}`)}"><header class="mcpv-config__card-head"><div><h3 class="mcpv-config__card-title">${attr(provider.id)}</h3><p class="mcpv-config__card-meta">${attr(provider.kind)} · ${attr(provider.modelId)}</p></div></header>${renderField(provider.field, model)}</article>`,
					)
					.join('')}</div>`;
	const artifactPanel = (
		id: 'agents' | 'skills' | 'prompts' | 'resources' | 'knowledge',
	): string => {
		const tab = model.tabs.find((entry) => entry.id === id)!;
		const body = tab.unavailable
			? `<p class="mcpv-config__notice">${attr(model.copy.unavailable)}</p>`
			: model.artifacts[id].length === 0
				? `<p class="mcpv-config__empty">${attr(model.copy.empty)}</p>`
				: `<div class="mcpv-config__card">${model.artifacts[id].map((artifact) => renderArtifact(artifact, model)).join('')}</div>`;
		return panel(id, model.copy.tabs[id], body, model);
	};
	return `<!doctype html>
<html lang="${attr(options.lang ?? 'en')}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${attr(model.copy.title)}</title><style${nonce}>${configurationCenterCss()}</style></head>
<body>
<main class="mcpv-config" data-mcpv-configuration-center data-state="${attr(model.state)}" data-dirty="false" data-config-digest="${attr(model.document.digest)}" data-copy-saved="${attr(model.copy.saved)}" data-copy-restart="${attr(model.copy.restartRequired)}" data-copy-conflict="${attr(model.copy.conflict)}" data-copy-invalid="${attr(model.copy.invalid)}">
	<header class="mcpv-config__header"><div class="mcpv-config__heading"><h1>${attr(model.copy.title)}</h1><p>${attr(model.copy.subtitle)}</p></div><input class="mcpv-config__search" type="search" data-config-search aria-label="${attr(model.copy.searchPlaceholder)}" placeholder="${attr(model.copy.searchPlaceholder)}" /></header>
	<div class="mcpv-config__body">
		<nav class="mcpv-config__nav" role="tablist" aria-label="${attr(model.copy.title)}">${model.tabs
			.map(
				(tab) =>
					`<button class="mcpv-config__tab" id="config-tab-${tab.id}" type="button" role="tab" data-config-tab="${tab.id}" aria-controls="config-panel-${tab.id}" aria-selected="${model.activeTab === tab.id ? 'true' : 'false'}" tabindex="${model.activeTab === tab.id ? '0' : '-1'}"><span>${attr(tab.label)}</span>${tab.unavailable ? '<span class="mcpv-config__tab-warning" aria-hidden="true">!</span>' : ''}<span class="mcpv-config__tab-count">${tab.count}</span></button>`,
			)
			.join('')}</nav>
		<div class="mcpv-config__content">${banner(model)}${panel('general', model.copy.tabs.general, renderFields(model.generalFields, model), model)}${panel('plugins', model.copy.tabs.plugins, pluginBody, model)}${panel('providers', model.copy.tabs.providers, providerBody, model)}${artifactPanel('agents')}${artifactPanel('skills')}${artifactPanel('prompts')}${artifactPanel('resources')}${artifactPanel('knowledge')}</div>
	</div>
	<footer class="mcpv-config__footer"><span class="mcpv-config__status" data-config-status aria-live="polite"></span><button class="mcpv-config__button mcpv-config__button--secondary" type="button" data-config-discard disabled>${attr(model.copy.discard)}</button><button class="mcpv-config__button mcpv-config__button--primary" type="button" data-config-save disabled>${attr(model.state === 'saving' ? model.copy.saving : model.copy.save)}</button></footer>
</main>
<script${nonce}>${configurationCenterScript()}</script>
</body></html>`;
};
