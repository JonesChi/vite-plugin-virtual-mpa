import type { MpaOptions, AllowedEvent } from './api-types';
import { type Plugin } from 'vite';
export declare function createMpaPlugin<PN extends string, PFN extends string, PT extends string, Event extends AllowedEvent, TPL extends string>(config: MpaOptions<PN, PFN, PT, Event, TPL>): Plugin;
