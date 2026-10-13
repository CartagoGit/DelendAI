import type { TPresetLanguage } from '../contracts/preset-identity.interface';
import type { IDogmaAdapter } from '../contracts/dogma-adapter.interface';

export class DogmaRegistry {
	private readonly map: Map<TPresetLanguage, IDogmaAdapter>;

	constructor(adapters: readonly IDogmaAdapter[]) {
		this.map = new Map(adapters.map((a) => [a.language, a]));
	}

	resolve(language: TPresetLanguage): IDogmaAdapter | undefined {
		return this.map.get(language);
	}
}
