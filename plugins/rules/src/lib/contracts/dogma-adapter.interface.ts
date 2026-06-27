import type { TPresetLanguage } from './preset-identity.interface';
import type {
	IOwnershipDogma,
	IErrorModelDogma,
	INullSafetyDogma,
	INamingStyleDogma,
	IAsyncModelDogma,
	IVisibilityDogma,
	IImmutabilityDogma,
	ITestingDogma,
} from './dogma.interface';

export interface IDogmaAdapter {
	readonly language: TPresetLanguage;
	readonly ownership: IOwnershipDogma;
	readonly errorModel: IErrorModelDogma;
	readonly nullSafety: INullSafetyDogma;
	readonly naming: INamingStyleDogma;
	readonly async: IAsyncModelDogma;
	readonly visibility: IVisibilityDogma;
	readonly immutability: IImmutabilityDogma;
	readonly testing: ITestingDogma;
	readonly packageManager: string;
	readonly bullets: readonly string[];
}
