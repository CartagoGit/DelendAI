import { parse } from 'yaml';

import {
	MEMORY_LIMIT_PATTERN,
	MEMORY_UNIT_BYTES,
} from '../contracts/constants/compose.constant';
import type {
	IComposeFile,
	IComposeLimits,
	IComposeService,
} from '../contracts/interfaces/compose-file.interface';

type TLoose = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is TLoose =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const asStringList = (value: unknown): readonly string[] =>
	Array.isArray(value)
		? value.map((entry) =>
				typeof entry === 'string' ? entry : JSON.stringify(entry),
			)
		: [];

/** Compose lets `environment` be a map or a `KEY=value` list. */
const parseEnvironment = (value: unknown): Readonly<Record<string, string>> => {
	const out: Record<string, string> = {};
	if (Array.isArray(value)) {
		for (const entry of value) {
			if (typeof entry !== 'string') continue;
			const at = entry.indexOf('=');
			if (at > 0) out[entry.slice(0, at)] = entry.slice(at + 1);
			else if (entry.length > 0) out[entry] = '';
		}
	} else if (isRecord(value)) {
		for (const [name, raw] of Object.entries(value)) {
			out[name] = raw === null || raw === undefined ? '' : String(raw);
		}
	}
	return out;
};

/** `512m` -> bytes; undefined when it is not a memory size. */
export const parseMemoryLimit = (value: unknown): number | undefined => {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string') return undefined;
	const match = MEMORY_LIMIT_PATTERN.exec(value.trim());
	if (match === null) return undefined;
	const unit = MEMORY_UNIT_BYTES[(match[2] ?? '').toLowerCase()];
	return unit === undefined ? undefined : Math.round(Number(match[1]) * unit);
};

const parseCpus = (value: unknown): number | undefined => {
	const cpus = typeof value === 'string' ? Number(value) : value;
	return typeof cpus === 'number' && Number.isFinite(cpus) ? cpus : undefined;
};

/** Limits from `mem_limit`/`cpus` or from `deploy.resources.limits`. */
const parseLimits = (service: TLoose): IComposeLimits => {
	const deploy = isRecord(service.deploy) ? service.deploy : {};
	const resources = isRecord(deploy.resources) ? deploy.resources : {};
	const limits = isRecord(resources.limits) ? resources.limits : {};
	const memoryBytes = parseMemoryLimit(service.mem_limit ?? limits.memory);
	const cpus = parseCpus(service.cpus ?? limits.cpus);
	return {
		...(memoryBytes === undefined ? {} : { memoryBytes }),
		...(cpus === undefined ? {} : { cpus }),
	};
};

const parseService = (name: string, raw: TLoose): IComposeService => ({
	name,
	...(typeof raw.image === 'string' ? { image: raw.image } : {}),
	...(typeof raw.working_dir === 'string'
		? { workingDir: raw.working_dir }
		: {}),
	environment: parseEnvironment(raw.environment),
	ports: asStringList(raw.ports),
	volumes: asStringList(raw.volumes),
	limits: parseLimits(raw),
});

/**
 * Read the basic shape of a compose file: its services with image,
 * working directory, environment, ports, volumes and resource limits.
 * Anything else in the file is ignored, not validated.
 */
export const parseComposeFile = (text: string): IComposeFile => {
	const document: unknown = parse(text);
	if (!isRecord(document) || !isRecord(document.services)) {
		throw new Error('compose file has no services section');
	}
	const services: Record<string, IComposeService> = {};
	for (const [name, raw] of Object.entries(document.services)) {
		services[name] = parseService(name, isRecord(raw) ? raw : {});
	}
	return { services };
};
