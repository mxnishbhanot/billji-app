export type DatabaseErrorCode =
  /** No local database on this platform (web, until the WASM/COOP build lands). */
  | 'DB_UNAVAILABLE'
  /** The file could not be opened — corrupt, out of disk, or a failed pragma. */
  | 'DB_OPEN_FAILED'
  /** A migration threw, or the schema is in a state the app cannot reconcile. */
  | 'DB_MIGRATION_FAILED'
  /** A statement or transaction failed at runtime. */
  | 'DB_QUERY_FAILED'
  /**
   * The queue refused an operation the sync protocol cannot express. Not a fault: the write
   * simply has to go online, exactly like the modules that were never made offline-capable.
   * Raised inside the write transaction, so no half-written row survives it.
   */
  | 'DB_UNSUPPORTED_OPERATION';

/**
 * Every failure that leaves this module is a DatabaseError, so a caller can branch on
 * `code` instead of pattern-matching driver strings that change between SQLite versions.
 */
export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;

  constructor(code: DatabaseErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    // `cause` rather than swallowing: the driver's message is the only thing that says
    // *why* SQLITE_BUSY happened, and it must survive to Sentry.
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

export const isDatabaseError = (error: unknown): error is DatabaseError => error instanceof DatabaseError;

/**
 * A local write the *domain* refused — not enough stock for the sale as billed, say.
 *
 * Distinct from a DatabaseError because the fallback differs: a store that is missing or
 * broken is a reason to go to the network, whereas a rule the server enforces too is not.
 * Retrying one of these online would either fail identically or, worse, succeed and leave the
 * user with a document they were never asked to confirm. It carries the server's error shape
 * so one screen handles both paths.
 */
export class LocalRuleError extends Error {
  readonly code: string;

  readonly details: unknown;

  constructor(code: string, message: string, details: unknown = null) {
    super(message);
    this.name = 'LocalRuleError';
    this.code = code;
    this.details = details;
  }
}

export const isLocalRuleError = (error: unknown): error is LocalRuleError => error instanceof LocalRuleError;

/** True when the local store simply does not exist here — a fallback, not a fault. */
export const isDatabaseUnavailable = (error: unknown) =>
  isDatabaseError(error) && error.code === 'DB_UNAVAILABLE';

/** True when the queue cannot carry this write, so the caller should send it online instead. */
export const isUnsupportedOperation = (error: unknown) =>
  isDatabaseError(error) && error.code === 'DB_UNSUPPORTED_OPERATION';

/**
 * Runs `task`, and rethrows anything it throws as a DatabaseError. A DatabaseError raised
 * inside passes through unchanged so the innermost, most specific code survives.
 *
 * So does a LocalRuleError, and that one matters more than it looks: every local write runs
 * inside `withTransaction`, which wraps this around it. Dressing a domain refusal up as
 * DB_QUERY_FAILED would send "not enough stock" to the network as though the store were
 * broken — silently issuing a document the user was never asked to confirm.
 */
export const wrapDatabaseError = async <T>(
  code: DatabaseErrorCode,
  message: string,
  task: () => Promise<T>
): Promise<T> => {
  try {
    return await task();
  } catch (error) {
    if (isDatabaseError(error) || isLocalRuleError(error)) throw error;
    throw new DatabaseError(code, `${message}: ${(error as Error)?.message ?? String(error)}`, { cause: error });
  }
};
