import { GetQueryExecutionCommand, QueryExecutionState, AthenaClient } from '@aws-sdk/client-athena';

/** Default polling interval (milliseconds) for query execution status. */
const DEFAULT_POLL_INTERVAL_MS = 1000;

/** Default timeout (milliseconds) for waiting for query execution to complete. */
const DEFAULT_TIMEOUT_MS = 1000 * 10;

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
   * Polling interval in milliseconds for this wait.
   * Overrides the waiter's default poll interval when specified.
   */
  pollIntervalMs?: number;
}

/**
 * Waits for Athena query execution to complete.
 * Polls execution status until it becomes SUCCEEDED, FAILED, or CANCELLED.
 */
export class AthenaQueryExecutionWaiter {

  private readonly defaultPollIntervalMs: number;

  /**
   * @param client Athena API client
   * @param options Optional settings (e.g. pollIntervalMs for polling interval)
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
   * @param timeoutMs Timeout in milliseconds. Defaults to DEFAULT_TIMEOUT_MS when omitted
   * @param waitOptions Optional per-call options (e.g. pollIntervalMs overrides default)
   * @returns Execution state on success (SUCCEEDED)
   * @throws AthenaQueryExecutionWaiterTimeoutError On timeout
   * @throws AthenaQueryExecutionWaiterStateError When state is FAILED or CANCELLED
   */
  async wait(
    queryExecutionId: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS,
    waitOptions?: AthenaQueryExecutionWaitOptions,
  ): Promise<QueryExecutionState> {
    const pollIntervalMs = waitOptions?.pollIntervalMs ?? this.defaultPollIntervalMs;
    const startTime = Date.now();
    do {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
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
