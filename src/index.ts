export {
  AthenaQueryExecutionWaiter,
  DEFAULT_TIMEOUT_MS,
} from './waiter';

export type {
  AthenaQueryExecutionWaitOptions,
  AthenaQueryExecutionWaiterOptions,
} from './waiter';

export {
  AthenaQueryExecutionWaiterAbortedError,
  AthenaQueryExecutionWaiterError,
  AthenaQueryExecutionWaiterMissingStateError,
  AthenaQueryExecutionWaiterStateError,
  AthenaQueryExecutionWaiterTimeoutError,
  AthenaQueryExecutionWaiterUnsupportedStateError,
} from './core/errors';
