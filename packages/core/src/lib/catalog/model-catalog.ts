import type {
	IModelCatalog,
	IModelCatalogEntry,
	IModelCatalogFilter,
	IModelCatalogSearchOptions,
	IModelCatalogErrorCode,
} from '../contracts/interfaces/model-catalog.interface';
import {
	ModelCatalogError,
	type IModelLifecycle,
} from '../contracts/interfaces/model-catalog.interface';
import {
	DEFAULT_MODEL_CATALOG_LIMIT,
	MAX_MODEL_CATALOG_LIMIT,
} from '../contracts/constants/model-catalog.constant';

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

const freezeDeep = <T>(value: T): T => {
	if (value === null || typeof value !== 'object') return value;
	for (const nested of Object.values(value as Record<string, unknown>)) {
		freezeDeep(nested);
	}
	return Object.freeze(value);
};

const cloneValue = <T>(value: T): T => {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) {
		return value.map((item) => cloneValue(item)) as T;
	}
	const clone: Record<string, unknown> = {};
	for (const [key, nested] of Object.entries(value)) {
		clone[key] = cloneValue(nested);
	}
	return clone as T;
};

const cloneEntry = (entry: IModelCatalogEntry): IModelCatalogEntry =>
	freezeDeep({
		...entry,
		aliases: [...entry.aliases],
		strengths: [...entry.strengths],
		weaknesses: [...entry.weaknesses],
		invoke:
			entry.invoke.kind === 'cli'
				? {
						...entry.invoke,
						...(entry.invoke.args
							? { args: [...entry.invoke.args] }
							: {}),
					}
				: entry.invoke.kind === 'mcp-server'
					? { ...entry.invoke, args: cloneValue(entry.invoke.args) }
					: { ...entry.invoke },
		...(entry.limits !== undefined ? { limits: { ...entry.limits } } : {}),
	});

const fail = (code: IModelCatalogErrorCode, message: string): never => {
	throw new ModelCatalogError(code, message);
};

const validateEntry = (entry: IModelCatalogEntry): void => {
	if (
		normalize(entry.key).length === 0 ||
		normalize(entry.provider).length === 0
	) {
		fail('invalid-entry', 'Model key and provider are required.');
	}
	if (entry.aliases.some((alias) => normalize(alias).length === 0)) {
		fail('invalid-entry', 'Model aliases must not be empty.');
	}
	if (
		entry.aliases.some((alias, index) =>
			entry.aliases
				.slice(index + 1)
				.some((other) => normalize(alias) === normalize(other)),
		)
	) {
		fail(
			'duplicate-alias',
			`Model ${entry.key} contains duplicate aliases.`,
		);
	}
	if (
		entry.aliases.some((alias) => normalize(alias) === normalize(entry.key))
	) {
		fail('duplicate-alias', `Model ${entry.key} uses its key as an alias.`);
	}
};

const lifecycleValues = (
	lifecycle: IModelCatalogFilter['lifecycle'],
): readonly IModelLifecycle[] =>
	lifecycle === undefined
		? ['active', 'deprecated', 'disabled']
		: Array.isArray(lifecycle)
			? lifecycle
			: [lifecycle as IModelLifecycle];

const resolveLimit = (limit: number | undefined): number => {
	if (limit === undefined) return DEFAULT_MODEL_CATALOG_LIMIT;
	if (!Number.isInteger(limit) || limit < 1) {
		fail(
			'invalid-limit',
			'Model catalog limit must be a positive integer.',
		);
	}
	return Math.min(limit, MAX_MODEL_CATALOG_LIMIT);
};

export class InMemoryModelCatalog implements IModelCatalog {
	private readonly entries = new Map<string, IModelCatalogEntry>();
	private readonly aliases = new Map<string, Set<string>>();

	register(entry: IModelCatalogEntry): IModelCatalogEntry {
		validateEntry(entry);
		const key = normalize(entry.key);
		if (this.entries.has(key)) {
			fail(
				'duplicate-key',
				`Model key ${entry.key} is already registered.`,
			);
		}
		for (const alias of entry.aliases) {
			const aliasKey = normalize(alias);
			if (this.entries.has(aliasKey)) {
				fail(
					'duplicate-alias',
					`Model alias ${alias} collides with a registered key.`,
				);
			}
			const owners = this.aliases.get(aliasKey);
			if (owners !== undefined && owners.size > 0) {
				fail(
					'duplicate-alias',
					`Model alias ${alias} is already registered.`,
				);
			}
		}

		const snapshot = cloneEntry(entry);
		this.entries.set(key, snapshot);
		for (const alias of snapshot.aliases) {
			const aliasKey = normalize(alias);
			const owners = this.aliases.get(aliasKey) ?? new Set<string>();
			owners.add(key);
			this.aliases.set(aliasKey, owners);
		}
		return snapshot;
	}

	unregister(key: string): boolean {
		const normalizedKey = normalize(key);
		const entry = this.entries.get(normalizedKey);
		if (entry === undefined) return false;
		this.entries.delete(normalizedKey);
		for (const alias of entry.aliases) {
			const aliasKey = normalize(alias);
			if (this.entries.has(aliasKey)) {
				fail(
					'duplicate-alias',
					`Model alias ${alias} collides with a registered key.`,
				);
			}
			const owners = this.aliases.get(aliasKey);
			owners?.delete(normalizedKey);
			if (owners?.size === 0) this.aliases.delete(aliasKey);
		}
		return true;
	}

	clear(): void {
		this.entries.clear();
		this.aliases.clear();
	}

	get(key: string): IModelCatalogEntry | undefined {
		return this.entries.get(normalize(key));
	}

	list(filter: IModelCatalogFilter = {}): readonly IModelCatalogEntry[] {
		const provider =
			filter.provider === undefined
				? undefined
				: normalize(filter.provider);
		const capabilities = filter.capabilities ?? [];
		const lifecycles = lifecycleValues(filter.lifecycle);
		const matches = [...this.entries.values()]
			.filter(
				(entry) =>
					(provider === undefined ||
						normalize(entry.provider) === provider) &&
					entry.contextWindow >= (filter.minContextWindow ?? 0) &&
					lifecycles.includes(entry.lifecycle) &&
					capabilities.every((capability) =>
						entry.strengths.includes(capability),
					),
			)
			.sort((left, right) =>
				normalize(left.key).localeCompare(normalize(right.key)),
			);
		return matches.slice(0, resolveLimit(filter.limit));
	}

	search(
		query: string,
		options: IModelCatalogSearchOptions = {},
	): readonly IModelCatalogEntry[] {
		const normalizedQuery = normalize(query);
		if (normalizedQuery.length === 0) return this.list(options);
		const matches = this.list({
			...options,
			limit: MAX_MODEL_CATALOG_LIMIT,
		}).filter((entry) =>
			[
				entry.key,
				entry.id,
				entry.modelId,
				entry.provider,
				entry.source,
				...entry.aliases,
				...entry.strengths,
			].some((value) => normalize(value).includes(normalizedQuery)),
		);
		return matches.slice(0, resolveLimit(options.limit));
	}

	resolveAlias(alias: string): IModelCatalogEntry | undefined {
		const owners = this.aliases.get(normalize(alias));
		if (owners === undefined || owners.size === 0) return undefined;
		if (owners.size > 1) {
			fail(
				'ambiguous-alias',
				`Model alias ${alias} resolves to multiple models.`,
			);
		}
		return this.entries.get([...owners][0]!);
	}
}

export { ModelCatalogError };
