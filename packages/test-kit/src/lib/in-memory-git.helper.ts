/**
 * in-memory-git.helper.ts — a git runner that answers from a table.
 *
 * A spec that only needs git's ANSWERS (the branch, the HEAD, what is
 * dirty) does not need a repository: it needs the code under test to be
 * handed a runner. Every call is recorded; a call with no answer fails
 * loudly instead of returning something plausible.
 */
import type {
	IGitAnswers,
	IInMemoryGit,
} from '../contracts/interfaces/in-memory-git.interface';

export const createInMemoryGit = (answers: IGitAnswers): IInMemoryGit => {
	const calls: string[] = [];
	return {
		calls,
		run: (_cwd, ...args) => {
			const key = args.join(' ');
			calls.push(key);
			const answer = answers[key];
			if (answer === undefined) {
				throw new Error(`in-memory git: no answer for "git ${key}"`);
			}
			return typeof answer === 'function' ? answer(args) : answer;
		},
	};
};
