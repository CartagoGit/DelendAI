import { WRITE_FILE_SCRIPT } from '../contracts/constants/file-transfer.constant';
import type { IExecFunction } from '../contracts/interfaces/exec-function.interface';

/** Write a file inside an environment that can only run commands. */
export const putFileViaExec = async (
	exec: IExecFunction,
	path: string,
	content: string,
): Promise<void> => {
	const result = await exec(['sh', '-c', WRITE_FILE_SCRIPT, 'sh', path], {
		stdin: content,
	});
	if (result.exitCode !== 0) {
		throw new Error(`could not write ${path}: ${result.stderr.trim()}`);
	}
};

/** Read a file inside an environment that can only run commands. */
export const getFileViaExec = async (
	exec: IExecFunction,
	path: string,
): Promise<string> => {
	const result = await exec(['cat', '--', path]);
	if (result.exitCode !== 0) {
		throw new Error(`could not read ${path}: ${result.stderr.trim()}`);
	}
	return result.stdout;
};
