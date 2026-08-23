import type { IErrorReportingOptions } from './options.interface';
import type { IReportStore } from './report-store.interface';

export interface IReportStatusToolOptions {
	readonly namespacePrefix: string;
	readonly options: IErrorReportingOptions;
	readonly store: IReportStore;
}
