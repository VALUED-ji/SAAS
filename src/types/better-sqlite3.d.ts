declare module "better-sqlite3" {
  namespace Database {
    interface RunResult {
      changes: number;
      lastInsertRowid: number | bigint;
    }

    interface Statement {
      all(...params: unknown[]): unknown[];
      get(...params: unknown[]): unknown;
      run(...params: unknown[]): RunResult;
    }

    interface Database {
      prepare(source: string): Statement;
      exec(source: string): void;
      close(): void;
      pragma(source: string): unknown;
    }
  }

  interface DatabaseConstructor {
    new (path: string, options?: Record<string, unknown>): Database.Database;
    (path: string, options?: Record<string, unknown>): Database.Database;
  }

  const Database: DatabaseConstructor;

  export = Database;
}
