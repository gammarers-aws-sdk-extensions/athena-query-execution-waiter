import { GetQueryExecutionCommand, QueryExecutionState, AthenaClient } from '@aws-sdk/client-athena';
import { classifyQueryExecutionWait } from './wait-predicates';

/** Default wait interval in milliseconds between status checks. */
const DEFAULT_WAIT_INTERVAL_MS = 1000;

/**
 * Default overall wait timeout (milliseconds) when `wait()` is called without
 * `waitOptions.timeoutMs`.
 * This caps total wall-clock time from the start of `wait()` until a terminal state
 * (or error)—it is not the delay between status checks (`waitIntervalMs`).
 *
 * **Why 2 minutes:** Athena often exceeds a few seconds (queueing, cold start, moderate
 * scans). Ten seconds fails too often as a library default; unbounded or very large
 * defaults risk hanging callers. Two minutes is a practical middle ground—tight enough
 * to surface stuck work, long enough for many interactive workloads. Use a larger
 * `wait(..., { timeoutMs })` for heavy analytics or ETL.
 */
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Throws {@link AthenaQueryExecutionWaiterAbortedError} when `signal` is already aborted.
 *
 * @param signal Optional abort signal from `wait()` options
 * @throws AthenaQueryExecutionWaiterAbortedError When `signal.aborted` is true
 */
const throwIfAborted = (signal?: AbortSignal): void => {
  if (signal?.aborted) {
    throw new AthenaQueryExecutionWaiterAbortedError(signal);
  }
};

/**
 * Waits for `ms` milliseconds, rejecting early when `signal` is aborted.
 *
 * @param ms Delay in milliseconds
 * @param signal Optional abort signal from `wait()` options
 * @throws AthenaQueryExecutionWaiterAbortedError When `signal` is aborted before or during the delay
 */
const delay = async (ms: number, signal?: AbortSignal): Promise<void> => {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = (): void => {
      cleanup();
      reject(new AthenaQueryExecutionWaiterAbortedError(signal));
    };
    const cleanup = (): void => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort);
  });
};

/** Constructor options for {@link AthenaQueryExecutionWaiter}. */
export interface AthenaQueryExecutionWaiterOptions {
  /**
   * Default wait interval in milliseconds between status checks for `wait()` calls
   * that omit `waitIntervalMs`.
   * Increase for long-running queries to reduce API calls.
   * Defaults to `1000` when omitted.
   */
  waitIntervalMs?: number;
}

/** Per-call options for {@link AthenaQueryExecutionWaiter.wait}. */
export interface AthenaQueryExecutionWaitOptions {
  /**
   * Overall wall-clock timeout in milliseconds for this wait (from the start of `wait()`
   * until a terminal state). Not the delay between status checks.
   * Defaults to {@link DEFAULT_TIMEOUT_MS} when omitted.
   */
  timeoutMs?: number;
  /**
   * Wait interval in milliseconds between status checks for this wait.
   * Overrides the waiter's default wait interval when specified.
   */
  waitIntervalMs?: number;
  /**
   * Optional abort signal. When aborted, waiting stops immediately and
   * {@link AthenaQueryExecutionWaiterAbortedError} is thrown—before the next status
   * check, after a status check returns, or during the wait interval.
   */
  signal?: AbortSignal;
}

/**
 * Waits for an Athena query execution to reach a terminal state.
 *
 * Repeatedly calls `GetQueryExecution` until the execution becomes
 * `SUCCEEDED`, `FAILED`, or `CANCELLED`. Overall wall-clock time is bounded by
 * `waitOptions.timeoutMs` (or {@link DEFAULT_TIMEOUT_MS}); spacing between status
 * checks is controlled separately by `waitIntervalMs`.
 */
export class AthenaQueryExecutionWaiter {

  private readonly defaultWaitIntervalMs: number;

  /**
   * @param client Athena API client
   * @param options Optional settings (e.g. waitIntervalMs)
   */
  constructor(
    private readonly client: AthenaClient,
    options?: AthenaQueryExecutionWaiterOptions,
  ) {
    this.defaultWaitIntervalMs = options?.waitIntervalMs ?? DEFAULT_WAIT_INTERVAL_MS;
  }

  /**
   * Waits until the given query execution completes, fails, or is cancelled.
   *
   * @param queryExecutionId Query execution ID returned by `StartQueryExecution`
   * @param waitOptions Optional per-call settings (`timeoutMs`, `waitIntervalMs`, `signal`)
   * @returns `QueryExecutionState.SUCCEEDED` when the query completes successfully
   * @throws AthenaQueryExecutionWaiterTimeoutError When overall wait exceeds the effective timeout
   * @throws AthenaQueryExecutionWaiterAbortedError When `waitOptions.signal` is aborted
   * @throws AthenaQueryExecutionWaiterStateError When the final state is `FAILED` or `CANCELLED`
   * @throws AthenaQueryExecutionWaiterMissingStateError When `QueryExecution`, `Status`, or `State` is missing
   * @throws AthenaQueryExecutionWaiterUnsupportedStateError When `State` is not a known {@link QueryExecutionState}
   */
  async wait(
    queryExecutionId: string,
    waitOptions?: AthenaQueryExecutionWaitOptions,
  ): Promise<QueryExecutionState> {
    const effectiveTimeoutMs = waitOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const waitIntervalMs = waitOptions?.waitIntervalMs ?? this.defaultWaitIntervalMs;
    const signal = waitOptions?.signal;
    const startTime = Date.now();
    do {
      throwIfAborted(signal);

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > effectiveTimeoutMs) {
        throw new AthenaQueryExecutionWaiterTimeoutError(elapsedTime);
      }

      const res = await this.client.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }));
      throwIfAborted(signal);

      const outcome = classifyQueryExecutionWait(res);

      if (outcome.kind === 'succeeded') {
        return QueryExecutionState.SUCCEEDED;
      }
      if (outcome.kind === 'failed') {
        throw new AthenaQueryExecutionWaiterStateError(outcome.state, outcome.reason);
      }
      if (outcome.kind === 'missing') {
        throw new AthenaQueryExecutionWaiterMissingStateError(outcome.detail);
      }
      if (outcome.kind === 'unsupported') {
        throw new AthenaQueryExecutionWaiterUnsupportedStateError(outcome.state);
      }

      await delay(waitIntervalMs, signal);
    } while (true);
  }
}

/**
 * Base error for Athena query execution waiter.
 */
export class AthenaQueryExecutionWaiterError extends Error {

  /**
   * @param message Error message
   */
  constructor(message: string) {
    super(message);
    this.name = 'AthenaQueryExecutionWaiterError';
  }
}

/**
 * Thrown when waiting is aborted via {@link AbortSignal}.
 *
 * @property signal Abort signal that triggered cancellation, if available
 */
export class AthenaQueryExecutionWaiterAbortedError extends AthenaQueryExecutionWaiterError {

  /**
   * @param signal Abort signal that triggered cancellation, if available
   */
  constructor(public readonly signal?: AbortSignal) {
    super('Athena query execution wait was aborted');
    this.name = 'AthenaQueryExecutionWaiterAbortedError';
  }
}

/**
 * Thrown when the overall wait exceeds `timeoutMs` or {@link DEFAULT_TIMEOUT_MS}.
 */
export class AthenaQueryExecutionWaiterTimeoutError extends AthenaQueryExecutionWaiterError {

  /**
   * @param elapsedTime Elapsed time in milliseconds until timeout
   */
  constructor(elapsedTime: number) {
    super(`Athena query timed out after ${elapsedTime}ms`);
    this.name = 'AthenaQueryExecutionWaiterTimeoutError';
  }
}

/**
 * Thrown when the query ends in `FAILED` or `CANCELLED` state.
 *
 * @property state Terminal execution state (`FAILED` or `CANCELLED`)
 * @property reason Athena-provided reason for the state change, or `'unknown'` when omitted
 */
export class AthenaQueryExecutionWaiterStateError extends AthenaQueryExecutionWaiterError {

  /**
   * @param state Final execution state (`FAILED` or `CANCELLED`)
   * @param reason Reason for the state change (e.g. error details). Defaults to `'unknown'` when omitted
   */
  constructor(public readonly state: QueryExecutionState, public readonly reason: string = 'unknown') {
    super(`Athena query execution failed with state ${state}: ${reason}`);
    this.name = 'AthenaQueryExecutionWaiterStateError';
  }
}

/**
 * Thrown when `GetQueryExecution` response lacks `QueryExecution`, `Status`, or `State`.
 *
 * @property detail Description of which part of the response was missing
 */
export class AthenaQueryExecutionWaiterMissingStateError extends AthenaQueryExecutionWaiterError {

  /**
   * @param detail Which part of the response was missing
   */
  constructor(public readonly detail: string) {
    super(`Athena query execution status is missing or incomplete: ${detail}`);
    this.name = 'AthenaQueryExecutionWaiterMissingStateError';
  }
}

/**
 * Thrown when `State` is present but not a known {@link QueryExecutionState} value.
 *
 * @property state Unsupported state string returned by Athena
 */
export class AthenaQueryExecutionWaiterUnsupportedStateError extends AthenaQueryExecutionWaiterError {

  /**
   * @param state Unsupported state string returned by Athena
   */
  constructor(public readonly state: string) {
    super(`Athena query execution returned unsupported state: ${state}`);
    this.name = 'AthenaQueryExecutionWaiterUnsupportedStateError';
  }
}
