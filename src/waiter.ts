import { AthenaClient, GetQueryExecutionCommand, QueryExecutionState } from '@aws-sdk/client-athena';
import {
  AthenaQueryExecutionWaiterAbortedError,
  AthenaQueryExecutionWaiterMissingStateError,
  AthenaQueryExecutionWaiterStateError,
  AthenaQueryExecutionWaiterTimeoutError,
  AthenaQueryExecutionWaiterUnsupportedStateError,
} from './core/errors';
import {
  classifyQueryExecutionWait,
  shouldContinueWaiting,
  type QueryExecutionWaitOutcome,
} from './core/wait-predicates';

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

/**
 * Maps a status check that is no longer in progress to success or a waiter error.
 *
 * @param outcome Classification other than `continue`
 * @returns `QueryExecutionState.SUCCEEDED` when the execution succeeded
 * @throws AthenaQueryExecutionWaiterStateError When the state is `FAILED` or `CANCELLED`
 * @throws AthenaQueryExecutionWaiterMissingStateError When required status fields are missing
 * @throws AthenaQueryExecutionWaiterUnsupportedStateError When `State` is not a known {@link QueryExecutionState}
 */
const resolveTerminalOutcome = (
  outcome: Exclude<QueryExecutionWaitOutcome, { readonly kind: 'continue' }>,
): QueryExecutionState => {
  if (outcome.kind === 'succeeded') {
    return QueryExecutionState.SUCCEEDED;
  }
  if (outcome.kind === 'failed') {
    throw new AthenaQueryExecutionWaiterStateError(outcome.state, outcome.reason);
  }
  if (outcome.kind === 'missing') {
    throw new AthenaQueryExecutionWaiterMissingStateError(outcome.detail);
  }

  throw new AthenaQueryExecutionWaiterUnsupportedStateError(outcome.state);
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

  /** Default wait interval used when `wait()` omits `waitIntervalMs`. */
  private readonly defaultWaitIntervalMs: number;

  /**
   * Creates a waiter that checks query execution status via `client`.
   *
   * @param client Athena API client used for `GetQueryExecution`
   * @param options Optional settings. `waitIntervalMs` sets the default delay between status checks
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
   * `GetQueryExecution` errors that the Athena client does not absorb propagate to the caller.
   *
   * @param queryExecutionId Query execution ID returned by `StartQueryExecution`
   * @param waitOptions Optional per-call settings (`timeoutMs`, `waitIntervalMs`, `signal`)
   * @returns `QueryExecutionState.SUCCEEDED` when the query completes successfully
   * @throws AthenaQueryExecutionWaiterTimeoutError When overall wait exceeds the effective timeout.
   * The error includes `queryExecutionId`, `elapsedTime`, and `timeoutMs`
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

    // Check at least once. Further iterations happen only while Athena still reports QUEUED or RUNNING.
    let outcome: QueryExecutionWaitOutcome;
    do {
      throwIfAborted(signal);

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > effectiveTimeoutMs) {
        throw new AthenaQueryExecutionWaiterTimeoutError(
          queryExecutionId,
          elapsedTime,
          effectiveTimeoutMs,
        );
      }

      const res = await this.client.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }));
      throwIfAborted(signal);

      outcome = classifyQueryExecutionWait(res);
      if (shouldContinueWaiting(outcome)) {
        await delay(waitIntervalMs, signal);
      }
    } while (shouldContinueWaiting(outcome));

    return resolveTerminalOutcome(outcome);
  }
}
