import type { ICliCommandContext } from './cli-command.interface';

/** Starts the server behind a context; called at most once. */
export type ICliContextOpener = () => Promise<ICliCommandContext>;
