/**
 * The slivers of Node's filesystem API that corruption.test.ts needs, declared here for the
 * same reason node-sqlite.d.ts is: adding "node" to tsconfig's `types` would let Node globals
 * typecheck in React Native source files where they cannot run.
 */
declare module 'node:fs' {
  export function writeFileSync(path: string, data: string): void;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
}
