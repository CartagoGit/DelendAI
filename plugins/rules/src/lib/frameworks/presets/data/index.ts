import type { IRulePreset } from '../../contracts';

import { CSHARP_PRESET } from './csharp';
import { ELIXIR_PRESET } from './elixir';
import { GO_PRESET } from './go';
import { JAVA_PRESET } from './java';
import { KOTLIN_PRESET } from './kotlin';
import { PYTHON_PRESET } from './python';
import { RUBY_PRESET } from './ruby';
import { RUST_PRESET } from './rust';
import { SWIFT_PRESET } from './swift';
import * as jvmPresets from './jvm';
import * as dotnetPresets from './dotnet';
import * as cfamilyPresets from './c-family';
import * as systemsPresets from './systems';
import * as functionalPresets from './functional';
import * as beamPresets from './beam';
import * as lispPresets from './lisp';
import * as scriptingPresets from './scripting';
import * as mobilePresets from './mobile';
import * as shellPresets from './shell';
import * as mathdataPresets from './math-data';
import * as docsPresets from './docs';
import * as configPresets from './config';
import * as stylesPresets from './styles';
import * as schemaPresets from './schema';
import * as smartcontractsPresets from './smart-contracts';
import * as notebooksPresets from './notebooks';
import * as buildPresets from './build';
import * as miscPresets from './misc';

export const ALL_PRESET_DATA: readonly IRulePreset[] = [
	RUST_PRESET,
	PYTHON_PRESET,
	GO_PRESET,
	RUBY_PRESET,
	JAVA_PRESET,
	KOTLIN_PRESET,
	SWIFT_PRESET,
	CSHARP_PRESET,
	ELIXIR_PRESET,
	...Object.values(jvmPresets),
	...Object.values(dotnetPresets),
	...Object.values(cfamilyPresets),
	...Object.values(systemsPresets),
	...Object.values(functionalPresets),
	...Object.values(beamPresets),
	...Object.values(lispPresets),
	...Object.values(scriptingPresets),
	...Object.values(mobilePresets),
	...Object.values(shellPresets),
	...Object.values(mathdataPresets),
	...Object.values(docsPresets),
	...Object.values(configPresets),
	...Object.values(stylesPresets),
	...Object.values(schemaPresets),
	...Object.values(smartcontractsPresets),
	...Object.values(notebooksPresets),
	...Object.values(buildPresets),
	...Object.values(miscPresets),
];

export {
	RUST_PRESET,
	PYTHON_PRESET,
	GO_PRESET,
	RUBY_PRESET,
	JAVA_PRESET,
	KOTLIN_PRESET,
	SWIFT_PRESET,
	CSHARP_PRESET,
	ELIXIR_PRESET,
};
