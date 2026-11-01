/**
 * declared-providers.helper.ts — the model catalogue with the providers a
 * project and a person declare laid over it: a declaration replaces the
 * catalogue's entry of the same id, a new id is added, the person's own
 * over the project's.
 */
import type {
	ICatalogueProvider,
	IModelCatalogue,
} from '../contracts/interfaces/account-finding.interface';
import type { IDeclaredProvider } from '../contracts/interfaces/declared-provider.interface';

/** A declaration in models.dev's shape as a catalogue entry. */
const asCatalogueProvider = (
	declared: IDeclaredProvider,
): ICatalogueProvider => ({
	id: declared.id,
	name: declared.name,
	env: declared.env,
	models: Array.isArray(declared.models)
		? declared.models
		: Object.keys(declared.models),
	...(declared.api === undefined ? {} : { api: declared.api }),
	...(declared.npm === undefined ? {} : { npm: declared.npm }),
	...(declared.doc === undefined ? {} : { doc: declared.doc }),
});

/**
 * `catalogue` with `declared` over it, in order (a later declaration of an
 * id wins). With no catalogue at all, the declarations are the catalogue.
 */
export const withDeclaredProviders = (
	catalogue: IModelCatalogue | undefined,
	declared: readonly IDeclaredProvider[],
	now: Date = new Date(),
): IModelCatalogue | undefined => {
	if (declared.length === 0) return catalogue;
	const byId = new Map(
		(catalogue?.providers ?? []).map((provider) => [provider.id, provider]),
	);
	for (const each of declared) byId.set(each.id, asCatalogueProvider(each));
	return {
		fetchedAt: catalogue?.fetchedAt ?? now.toISOString(),
		providers: [...byId.values()],
	};
};
