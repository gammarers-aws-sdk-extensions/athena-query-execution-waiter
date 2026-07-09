import { QueryExecutionState } from '@aws-sdk/client-athena';

/** Minimal GetQueryExecution shape used while waiting (State may be unknown at runtime). */
export interface QueryExecutionWaitResponse {
  QueryExecution?: {
    Status?: {
      State?: string;
      StateChangeReason?: string;
    };
  };
}

/** Result of classifying a single GetQueryExecution response during a wait. */
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

const IN_PROGRESS_STATES: ReadonlySet<string> = new Set([
  QueryExecutionState.QUEUED,
  QueryExecutionState.RUNNING,
]);

/**
 * Classifies GetQueryExecution response for the waiter loop.
 *
 * @param response GetQueryExecution API response (or subset)
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
      reason: status.StateChangeReason ?? 'unknown',
    };
  }
  if (state === QueryExecutionState.CANCELLED) {
    return {
      kind: 'failed',
      state: QueryExecutionState.CANCELLED,
      reason: status.StateChangeReason ?? 'unknown',
    };
  }

  if (IN_PROGRESS_STATES.has(state)) {
    return { kind: 'continue' };
  }

  return { kind: 'unsupported', state };
};

/**
 * @param outcome Outcome from {@link classifyQueryExecutionWait}
 * @returns Whether the waiter should continue waiting after the interval
 */
export const shouldContinueWaiting = (outcome: QueryExecutionWaitOutcome): boolean =>
  outcome.kind === 'continue';
