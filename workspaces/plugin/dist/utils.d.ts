import type { Page, ScanOptions } from './api-types';
/**
 * Replace slash and backslash with single slash.
 * This uses for cross-platform path parsing.
 */
export declare function replaceSlash<T extends string | undefined | null>(str: T): T extends string ? string : T extends undefined | null ? T : never;
/**
 * This function simply converts the arguments to an array and returns them.
 * It helps creating pages configuration with type hints independently outside plugin function.
 */
export declare function createPages<Name extends string, Filename extends string, Tpl extends string>(pages: Page<Name, Filename, Tpl> | Page<Name, Filename, Tpl>[]): Page<Name, Filename, Tpl>[];
/**
 * Generate pages configurations using scanOptions.
 */
export declare function scanPages(scanOptions?: ScanOptions): Page<string, string, string>[];
