import { readFile } from 'node:fs/promises';

export type IDockerfileFetcher = (dockerfileAbsPath: string) => Promise<string>;

export const realDockerfileFetcher: IDockerfileFetcher = async (
	dockerfileAbsPath,
) => readFile(dockerfileAbsPath, 'utf8');
