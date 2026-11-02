import type { IArgumentIssue } from '../contracts/interfaces/argument-issue.interface';
import { type IToolTextResult, toolError } from './tool-response';

/**
 * The refusal for arguments a tool's input schema rejected: every issue,
 * by path, under the stable code `invalid-arguments`.
 */
export const toolInvalidArguments = (
	issues: readonly IArgumentIssue[],
): IToolTextResult =>
	toolError(
		issues
			.map(
				(issue) =>
					`${issue.path.map(String).join('.')}: ${issue.message}`,
			)
			.join('; '),
		'Fix the arguments and call again.',
		'invalid-arguments',
	);
