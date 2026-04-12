import { GetQueryExecutionCommand, QueryExecutionState, AthenaClient } from '@aws-sdk/client-athena';

/** Default polling interval (milliseconds) for query execution status. */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/**
 * Default overall wait timeout (milliseconds) when `wait()` is called without
 * `waitOptions.timeoutMs`.
 * This caps total wall-clock time from the start of `wait()` until a terminal state
 * (or error)—it is not the delay between polls (`pollIntervalMs`).
 *
 * **Why 2 minutes:** Athena often exceeds a few seconds (queueing, cold start, moderate
 * scans). Ten seconds fails too often as a library default; unbounded or very large
 * defaults risk hanging callers. Two minutes is a practical middle ground—tight enough
 * to surface stuck work, long enough for many interactive workloads. Use a larger
 * `wait(..., { timeoutMs })` for heavy analytics or ETL.
 */
export const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;

/** Options for AthenaQueryExecutionWaiter constructor. */
export interface AthenaQueryExecutionWaiterOptions {
  /**
   * Polling interval in milliseconds.
   * Increase for long-running queries to reduce API calls.
   * Defaults to DEFAULT_POLL_INTERVAL_MS (1000) when omitted.
   */
  pollIntervalMs?: number;
}

/** Options for wait(). */
export interface AthenaQueryExecutionWaitOptions {
  /**
   * Overall wall-clock timeout in milliseconds for this wait (from the start of `wait()`
   * until a terminal state). Not the delay between polls.
   * Defaults to {@link DEFAULT_TIMEOUT_MS} when omitted.
   */
  timeoutMs?: number;
  /**
   * Polling interval in milliseconds for this wait.
   * Overrides the waiter's default poll interval when specified.
   */
  pollIntervalMs?: number;
}

/**
 * Waits for Athena query execution to complete.
 * Polls execution status until it becomes SUCCEEDED, FAILED, or CANCELLED.
 * Overall time is bounded by `waitOptions.timeoutMs` (or {@link DEFAULT_TIMEOUT_MS});
 * spacing between polls is controlled separately by `pollIntervalMs`.
 */
export class AthenaQueryExecutionWaiter {

  private readonly defaultPollIntervalMs: number;

  /**
   * @param client Athena API client
   * @param options Optional settings (e.g. pollIntervalMs)
   */
  constructor(
    private readonly client: AthenaClient,
    options?: AthenaQueryExecutionWaiterOptions,
  ) {
    this.defaultPollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  /**
   * Waits until the given query execution completes (or fails/cancels).
   *
   * @param queryExecutionId Query execution ID to wait for
   * @param waitOptions Optional per-call settings (`timeoutMs`, `pollIntervalMs`)
   * @returns Execution state on success (SUCCEEDED)
   * @throws AthenaQueryExecutionWaiterTimeoutError On timeout
   * @throws AthenaQueryExecutionWaiterStateError When state is FAILED or CANCELLED
   */
  async wait(
    queryExecutionId: string,
    waitOptions?: AthenaQueryExecutionWaitOptions,
  ): Promise<QueryExecutionState> {
    const effectiveTimeoutMs = waitOptions?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const pollIntervalMs = waitOptions?.pollIntervalMs ?? this.defaultPollIntervalMs;
    const startTime = Date.now();
    do {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > effectiveTimeoutMs) {
        throw new AthenaQueryExecutionWaiterTimeoutError(elapsedTime);
      }

      const res = await this.client.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }));
      const st = res.QueryExecution?.Status;
      const state = st?.State as QueryExecutionState | undefined;
      const reason = st?.StateChangeReason;

      if (state === QueryExecutionState.SUCCEEDED) {
        return state;
      }
      if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
        throw new AthenaQueryExecutionWaiterStateError(state, reason ?? 'unknown');
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
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
 * Thrown when waiting for query execution times out.
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
 * Thrown when the query ends in FAILED or CANCELLED state.
 */
export class AthenaQueryExecutionWaiterStateError extends AthenaQueryExecutionWaiterError {

  /**
   * @param state Final execution state (FAILED or CANCELLED)
   * @param reason Reason for the state change (e.g. error details). Defaults to 'unknown' when omitted
   */
  constructor(public readonly state: QueryExecutionState, public readonly reason: string = 'unknown') {
    super(`Athena query execution failed with state ${state}: ${reason}`);
    this.name = 'AthenaQueryExecutionWaiterStateError';
  }
}
