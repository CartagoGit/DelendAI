import {
	type IContainedPath,
	resolveAgainstRoots,
} from '../shared/contain-path';
import { realpathContained } from '../shared/contain-realpath';

interface IEffectiveContainmentOptions {
	readonly authorizedRoots?: readonly string[];
	readonly caseInsensitive?: boolean;
}

export const resolveWorkspaceContainedEffective = async (
	workspaceRootAbs: string,
	child: string,
	options: IEffectiveContainmentOptions = {},
): Promise<IContainedPath> => {
	const authorizedRoots = options.authorizedRoots ?? [];
	const contained = resolveAgainstRoots(
		workspaceRootAbs,
		authorizedRoots,
		child,
		{
			...(options.caseInsensitive !== undefined
				? { caseInsensitive: options.caseInsensitive }
				: {}),
		},
	);
	if (!contained.ok) {
		return contained;
	}
	if (
		!(await realpathContained(contained.abs, [
			workspaceRootAbs,
			...authorizedRoots,
		]))
	) {
		return {
			ok: false,
			abs: contained.abs,
			rel: contained.rel,
			reason: `effective path escapes workspace: ${child}`,
		};
	}
	return contained;
};
