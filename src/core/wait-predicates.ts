import { QueryExecutionState } from '@aws-sdk/client-athena';

/**
 * Minimal `GetQueryExecution` response shape used while waiting.
 * `State` may be an unknown string at runtime.
 */
export interface QueryExecutionWaitResponse {
  QueryExecution?: {
    Status?: {
      State?: string;
      StateChangeReason?: string;
    };
  };
}

/**
 * Result of classifying a single `GetQueryExecution` response during a wait.
 *
 * - `succeeded` — execution completed successfully
 * - `failed` — execution ended in `FAILED` or `CANCELLED`
 * - `continue` — execution is still in progress (`QUEUED` or `RUNNING`)
 * - `missing` — required fields are absent from the response
 * - `unsupported` — `State` is not a known {@link QueryExecutionState}
 */
export type QueryExecutionWaitOutcome =
  | { readonly kind: 'succeeded' }
  | {
    readonly kind: 'failed';
    readonly state: typeof QueryExecutionState.FAILED | typeof QueryExecutionState.CANCELLED;
    readonly reason: string;
  }
  | { readonly kind: 'continue' }
  | { readonly kind: 'missing'; readonly detail: string }
  | { readonly kind: 'unsupported'; readonly state: string };

/** Reason stored when Athena omits `StateChangeReason`. */
export const UNKNOWN_STATE_CHANGE_REASON = 'unknown';

/** Execution states that require further waiting before a terminal outcome. */
const IN_PROGRESS_STATES: ReadonlySet<string> = new Set([
  QueryExecutionState.QUEUED,
  QueryExecutionState.RUNNING,
]);

/**
 * Classifies a `GetQueryExecution` response for the waiter loop.
 *
 * @param response `GetQueryExecution` API response (or a compatible subset)
 * @returns How the waiter should proceed for this status check
 */
export const classifyQueryExecutionWait = (
  response: QueryExecutionWaitResponse,
): QueryExecutionWaitOutcome => {
  const queryExecution = response.QueryExecution;
  if (queryExecution === undefined) {
    return {
      kind: 'missing',
      detail: 'QueryExecution is missing from GetQueryExecution response',
    };
  }

  const status = queryExecution.Status;
  if (status === undefined) {
    return {
      kind: 'missing',
      detail: 'QueryExecution.Status is missing',
    };
  }

  const state = status.State;
  if (state === undefined) {
    return {
      kind: 'missing',
      detail: 'QueryExecution.Status.State is missing',
    };
  }

  if (state === QueryExecutionState.SUCCEEDED) {
    return { kind: 'succeeded' };
  }

  if (state === QueryExecutionState.FAILED) {
    return {
      kind: 'failed',
      state: QueryExecutionState.FAILED,
      reason: status.StateChangeReason ?? UNKNOWN_STATE_CHANGE_REASON,
    };
  }

  if (state === QueryExecutionState.CANCELLED) {
    return {
      kind: 'failed',
      state: QueryExecutionState.CANCELLED,
      reason: status.StateChangeReason ?? UNKNOWN_STATE_CHANGE_REASON,
    };
  }

  if (IN_PROGRESS_STATES.has(state)) {
    return { kind: 'continue' };
  }

  return { kind: 'unsupported', state };
};

/**
 * Returns whether the waiter should perform another status check after the wait interval.
 *
 * @param outcome Outcome from {@link classifyQueryExecutionWait}
 * @returns `true` when `outcome.kind` is `'continue'`; otherwise `false`
 */
export const shouldContinueWaiting = (
  outcome: QueryExecutionWaitOutcome,
): outcome is Extract<QueryExecutionWaitOutcome, { readonly kind: 'continue' }> =>
  outcome.kind === 'continue';
