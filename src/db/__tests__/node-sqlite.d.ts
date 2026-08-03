/**
 * node:sqlite ships with Node 22 and is used by schema.test.ts to run the migration SQL
 * through a real engine. It is declared here rather than by adding "node" to tsconfig's
 * `types`, which would pull Node globals into every React Native source file and let a
 * `Buffer` or `process.cwd()` typecheck in app code where it cannot run.
 */
declare module 'node:sqlite' {
  export type SQLiteRow = Record<string, unknown>;

  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number };
    get(...params: unknown[]): SQLiteRow | undefined;
    all(...params: unknown[]): SQLiteRow[];
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
