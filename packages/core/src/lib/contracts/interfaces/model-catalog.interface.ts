import type { CapabilityTag, IProviderCapabilities } from './provider-capabilities.interface';

export type ModelLifecycle = 'active' | 'deprecated' | 'disabled';

export interface IModelLimits {
	readonly maxInputTokens?: number;
	readonly maxOutputTokens?: number;
}

export interface IModelCatalogEntry extends IProviderCapabilities {
	readonly key: string;
	readonly aliases: readonly string[];
	readonly provider: string;
	readonly source: string;
	readonly lifecycle: ModelLifecycle;
	readonly limits?: IModelLimits;
}

export interface IModelCatalogFilter {
	readonly provider?: string;
	readonly capabilities?: readonly CapabilityTag[];
	readonly minContextWindow?: number;
	readonly lifecycle?: ModelLifecycle | readonly ModelLifecycle[];
	readonly limit?: number;
}

export interface IModelCatalogSearchOptions extends IModelCatalogFilter {
	readonly query?: string;
}

export type ModelCatalogErrorCode = 'duplicate-key' | 'duplicate-alias' | 'ambiguous-alias' | 'invalid-entry' | 'invalid-limit';

export class ModelCatalogError extends Error {
	readonly code: ModelCatalogErrorCode;

	constructor(code: ModelCatalogErrorCode, message: string) {
		super(message);
		this.name = 'ModelCatalogError';
		this.code = code;
	}
}

export interface IModelCatalog {
	register(entry: IModelCatalogEntry): IModelCatalogEntry;
	unregister(key: string): boolean;
	clear(): void;
	get(key: string): IModelCatalogEntry | undefined;
	list(filter?: IModelCatalogFilter): readonly IModelCatalogEntry[];
	search(
		query: string,
		options?: IModelCatalogSearchOptions,
	): readonly IModelCatalogEntry[];
	resolveAlias(alias: string): IModelCatalogEntry | undefined;
}