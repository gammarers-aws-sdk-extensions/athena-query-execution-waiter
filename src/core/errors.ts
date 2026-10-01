import { QueryExecutionState } from '@aws-sdk/client-athena';
import { UNKNOWN_STATE_CHANGE_REASON } from './wait-predicates';

/**
 * Base class for Athena query execution waiter errors.
 *
 * Abstract so callers construct a concrete subclass. `instanceof` still matches every waiter error.
 */
export abstract class AthenaQueryExecutionWaiterError extends Error {

  override readonly name: string = 'AthenaQueryExecutionWaiterError';

  /**
   * Creates a waiter error with the given message.
   *
   * @param message Error message
   */
  protected constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterError.prototype);
  }
}

/**
 * Thrown when waiting is aborted via {@link AbortSignal}.
 *
 * @property signal Abort signal that triggered cancellation, if available
 */
export class AthenaQueryExecutionWaiterAbortedError extends AthenaQueryExecutionWaiterError {

  override readonly name: string = 'AthenaQueryExecutionWaiterAbortedError';

  /**
   * Creates an error for an aborted wait.
   *
   * @param signal Abort signal that triggered cancellation, if available
   */
  constructor(public readonly signal?: AbortSignal) {
    super('Athena query execution wait was aborted');
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterAbortedError.prototype);
  }
}

/**
 * Thrown when the overall wait exceeds `timeoutMs` or `DEFAULT_TIMEOUT_MS`.
 *
 * The error message and properties include `queryExecutionId`, `elapsedTime`, and
 * `timeoutMs` so timeouts can be correlated in mixed logs.
 *
 * @property queryExecutionId Query execution ID that was being waited on
 * @property elapsedTime Elapsed wall-clock time in milliseconds when the timeout was detected
 * @property timeoutMs Effective overall timeout in milliseconds (`waitOptions.timeoutMs` or `DEFAULT_TIMEOUT_MS`)
 */
export class AthenaQueryExecutionWaiterTimeoutError extends AthenaQueryExecutionWaiterError {

  override readonly name: string = 'AthenaQueryExecutionWaiterTimeoutError';

  /**
   * Creates a timeout error that includes the query execution ID and timeout context.
   *
   * @param queryExecutionId Query execution ID that was being waited on
   * @param elapsedTime Elapsed wall-clock time in milliseconds when the timeout was detected
   * @param timeoutMs Effective overall timeout in milliseconds (`waitOptions.timeoutMs` or `DEFAULT_TIMEOUT_MS`)
   */
  constructor(
    public readonly queryExecutionId: string,
    public readonly elapsedTime: number,
    public readonly timeoutMs: number,
  ) {
    super(
      `Athena query execution ${queryExecutionId} timed out after ${elapsedTime}ms (timeoutMs: ${timeoutMs})`,
    );
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterTimeoutError.prototype);
  }
}

/**
 * Thrown when the query ends in `FAILED` or `CANCELLED` state.
 *
 * @property state Terminal execution state (`FAILED` or `CANCELLED`)
 * @property reason Athena-provided reason for the state change, or `'unknown'` when omitted
 */
export class AthenaQueryExecutionWaiterStateError extends AthenaQueryExecutionWaiterError {

  override readonly name: string = 'AthenaQueryExecutionWaiterStateError';

  /**
   * Creates an error for a query that ended in `FAILED` or `CANCELLED`.
   *
   * @param state Final execution state (`FAILED` or `CANCELLED`)
   * @param reason Reason for the state change (e.g. error details). Defaults to `'unknown'` when omitted
   */
  constructor(
    public readonly state: QueryExecutionState,
    public readonly reason: string = UNKNOWN_STATE_CHANGE_REASON,
  ) {
    super(`Athena query execution failed with state ${state}: ${reason}`);
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterStateError.prototype);
  }
}

/**
 * Thrown when `GetQueryExecution` response lacks `QueryExecution`, `Status`, or `State`.
 *
 * @property detail Description of which part of the response was missing
 */
export class AthenaQueryExecutionWaiterMissingStateError extends AthenaQueryExecutionWaiterError {

  override readonly name: string = 'AthenaQueryExecutionWaiterMissingStateError';

  /**
   * Creates an error for a `GetQueryExecution` response that lacks required status fields.
   *
   * @param detail Which part of the response was missing
   */
  constructor(public readonly detail: string) {
    super(`Athena query execution status is missing or incomplete: ${detail}`);
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterMissingStateError.prototype);
  }
}

/**
 * Thrown when `State` is present but not a known {@link QueryExecutionState} value.
 *
 * @property state Unsupported state string returned by Athena
 */
export class AthenaQueryExecutionWaiterUnsupportedStateError extends AthenaQueryExecutionWaiterError {

  override readonly name: string = 'AthenaQueryExecutionWaiterUnsupportedStateError';

  /**
   * Creates an error for a `State` value that is not a known {@link QueryExecutionState}.
   *
   * @param state Unsupported state string returned by Athena
   */
  constructor(public readonly state: string) {
    super(`Athena query execution returned unsupported state: ${state}`);
    Object.setPrototypeOf(this, AthenaQueryExecutionWaiterUnsupportedStateError.prototype);
  }
}
