import type { IPluginManifest } from '../contracts/interfaces/plugin-manifest.interface';
import { parsePluginManifest } from './define-plugin-manifest';

export const validatePluginManifest = (manifest: unknown): IPluginManifest =>
	parsePluginManifest(manifest);
