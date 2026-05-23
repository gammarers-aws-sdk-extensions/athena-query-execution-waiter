import { QueryExecutionState } from '@aws-sdk/client-athena';
import {
  classifyQueryExecutionPoll,
  shouldContinuePolling,
  type QueryExecutionPollResponse,
} from '../src/wait-predicates';

describe('classifyQueryExecutionPoll', () => {
  it.each([
    {
      label: 'SUCCEEDED',
      response: { QueryExecution: { Status: { State: QueryExecutionState.SUCCEEDED } } },
      expected: { kind: 'succeeded' },
    },
    {
      label: 'FAILED with reason',
      response: {
        QueryExecution: {
          Status: { State: QueryExecutionState.FAILED, StateChangeReason: 'boom' },
        },
      },
      expected: { kind: 'failed', state: QueryExecutionState.FAILED, reason: 'boom' },
    },
    {
      label: 'CANCELLED without reason',
      response: { QueryExecution: { Status: { State: QueryExecutionState.CANCELLED } } },
      expected: { kind: 'failed', state: QueryExecutionState.CANCELLED, reason: 'unknown' },
    },
    {
      label: 'QUEUED',
      response: { QueryExecution: { Status: { State: QueryExecutionState.QUEUED } } },
      expected: { kind: 'continue' },
    },
    {
      label: 'RUNNING',
      response: { QueryExecution: { Status: { State: QueryExecutionState.RUNNING } } },
      expected: { kind: 'continue' },
    },
    {
      label: 'missing QueryExecution',
      response: {},
      expected: {
        kind: 'missing',
        detail: 'QueryExecution is missing from GetQueryExecution response',
      },
    },
    {
      label: 'missing Status',
      response: { QueryExecution: {} },
      expected: { kind: 'missing', detail: 'QueryExecution.Status is missing' },
    },
    {
      label: 'missing State',
      response: { QueryExecution: { Status: {} } },
      expected: { kind: 'missing', detail: 'QueryExecution.Status.State is missing' },
    },
    {
      label: 'unknown state',
      response: { QueryExecution: { Status: { State: 'FUTURE_STATE' } } },
      expected: { kind: 'unsupported', state: 'FUTURE_STATE' },
    },
  ] satisfies ReadonlyArray<{
    label: string;
    response: QueryExecutionPollResponse;
    expected: ReturnType<typeof classifyQueryExecutionPoll>;
  }>)('returns $expected.kind for $label', ({ response, expected }) => {
    expect(classifyQueryExecutionPoll(response)).toEqual(expected);
  });
});

describe('shouldContinuePolling', () => {
  it.each([
    { outcome: { kind: 'continue' as const }, expected: true },
    { outcome: { kind: 'succeeded' as const }, expected: false },
    { outcome: { kind: 'missing' as const, detail: 'x' }, expected: false },
    { outcome: { kind: 'unsupported' as const, state: 'X' }, expected: false },
  ])('returns $expected when kind is $outcome.kind', ({ outcome, expected }) => {
    expect(shouldContinuePolling(outcome)).toBe(expected);
  });
});
