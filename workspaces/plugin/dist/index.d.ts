import type { Plugin } from 'vite';
import type { AllowedEvent, MpaOptions } from './api-types';
export * from './api-types';
export { createPages } from './utils';
export declare function createMpaPlugin<PN extends string, PFN extends string, PT extends string, Event extends AllowedEvent, TPL extends string>(config: MpaOptions<PN, PFN, PT, Event, TPL>): Plugin[];
