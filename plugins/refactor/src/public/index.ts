export type { INavEngine, INavHit, INavHitKind } from '../lib/nav/nav-engine';
export { buildNavEngine, parseSourceFile } from '../lib/nav/nav-engine';
export type { IRefactorNavToolOptions } from '../lib/tools/refactor-nav.tool';
export { buildRefactorNavToolRegistrations } from '../lib/tools/refactor-nav.tool';

// S2 exports
export type {
	IFileReader,
	IHunk,
	IHunkLine,
	IRenamePlan,
	IRenameFilePlan,
	IAmbiguousSymbol,
	IRenamePlanError,
	IRenamePlanResult,
	IRenameRequest,
} from '../lib/rename/rename-planner';
export { planRename } from '../lib/rename/rename-planner';
export type { IRefactorRenameToolOptions } from '../lib/tools/refactor-rename.tool';
export { buildRefactorRenameToolRegistrations } from '../lib/tools/refactor-rename.tool';
