export {
	authorPlugin,
	repairPlugin,
} from './scaffold/author-plugin';
export type {
	IAuthorPluginOptions,
	IAuthorPluginRegistration,
	IAuthorPluginResult,
	IAuthorPluginSpec,
	IPluginFieldSpec,
	IPluginFieldType,
	IPluginToolSpec,
	IRepairPluginResult,
} from './scaffold/author-plugin';
export {
	writeScaffoldedFiles,
	writeScaffoldedFilesOrThrow,
} from './scaffold/write-scaffolded-files';
export type {
	IWriteScaffoldedFilesOptions,
	IWriteScaffoldedFilesResult,
} from './scaffold/write-scaffolded-files';
export {
	readConfigurationDocument,
	saveConfigurationDocument,
} from './services/configuration-center.service';
export { setPluginActivation } from './services/plugin-activation.service';
export type {
	ISetPluginActivationInput,
	ISetPluginActivationResult,
} from '../lib/contracts/interfaces/plugin-activation.interface';
