# Athena Query Execution Waiter

A small library that waits for an AWS Athena query execution to complete. It polls the Athena API until the execution reaches a terminal state: **SUCCEEDED**, **FAILED**, or **CANCELLED**.

## Installation

```bash
npm install athena-query-execution-waiter
# or
yarn add athena-query-execution-waiter
```

## Requirements

- **Node.js** >= 20.0.0
- **@aws-sdk/client-athena** (peer dependency; compatible with AWS SDK v3)

## Usage

```typescript
import { AthenaClient } from '@aws-sdk/client-athena';
import {
  AthenaQueryExecutionWaiter,
  AthenaQueryExecutionWaiterTimeoutError,
  AthenaQueryExecutionWaiterStateError,
} from 'athena-query-execution-waiter';

const client = new AthenaClient({ region: 'us-east-1' });
const waiter = new AthenaQueryExecutionWaiter(client);

// Start a query with StartQueryExecution, then wait for it to complete
const queryExecutionId = 'your-query-execution-id';

try {
  const state = await waiter.wait(queryExecutionId);
  console.log('Query completed:', state); // "SUCCEEDED"
} catch (err) {
  if (err instanceof AthenaQueryExecutionWaiterTimeoutError) {
    console.error('Query timed out');
  }
  if (err instanceof AthenaQueryExecutionWaiterStateError) {
    console.error('Query failed or cancelled:', err.state, err.reason);
  }
  throw err;
}
```

### Custom timeout

The default timeout is 10 seconds. You can pass a custom timeout in milliseconds:

```typescript
const state = await waiter.wait(queryExecutionId, 60_000); // 60 seconds
```

## API

### `AthenaQueryExecutionWaiter`

- **Constructor:** `new AthenaQueryExecutionWaiter(client: AthenaClient)`
  - `client` – An AWS SDK v3 `AthenaClient` instance.

- **`wait(queryExecutionId: string, timeoutMs?: number): Promise<QueryExecutionState>`**
  - Polls the query execution status until it completes.
  - **Returns** the execution state (`SUCCEEDED`) on success.
  - **Throws** `AthenaQueryExecutionWaiterTimeoutError` if the timeout is exceeded.
  - **Throws** `AthenaQueryExecutionWaiterStateError` when the state is `FAILED` or `CANCELLED`.
  - `timeoutMs` defaults to 10,000 ms when omitted. Polling interval is 1 second.

### Errors

- **`AthenaQueryExecutionWaiterError`** – Base class for all waiter errors.

- **`AthenaQueryExecutionWaiterTimeoutError`** – Thrown when the wait duration exceeds `timeoutMs`.
  - Extends `AthenaQueryExecutionWaiterError`.
  - Constructor: `(elapsedTime: number)`.

- **`AthenaQueryExecutionWaiterStateError`** – Thrown when the query ends in `FAILED` or `CANCELLED`.
  - Extends `AthenaQueryExecutionWaiterError`.
  - Properties: `state` (`QueryExecutionState`), `reason` (string).
  - Constructor: `(state: QueryExecutionState, reason?: string)`.

## License

This project is licensed under the Apache-2.0 License.
