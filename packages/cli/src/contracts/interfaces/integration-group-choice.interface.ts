import type { IRehearsalScenario } from '@delendai/integration/public';

import type { ICliCommandResult } from './cli-command.interface';

/** What `--group` asks for, or why it cannot be played. */
export type IGroupChoice =
	| { readonly scenarios: readonly IRehearsalScenario[]; readonly n?: number }
	| { readonly refusal: ICliCommandResult };
