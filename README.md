# Athena Query Execution Waiter

[![npm version](https://img.shields.io/npm/v/athena-query-execution-waiter.svg)](https://www.npmjs.com/package/athena-query-execution-waiter)
[![License](https://img.shields.io/npm/l/athena-query-execution-waiter.svg)](https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter/blob/main/LICENSE)

A small library that waits for an AWS Athena query execution to complete. It repeatedly calls the Athena API until the execution reaches a terminal state: **SUCCEEDED**, **FAILED**, or **CANCELLED**.

## Features

- Waits on `GetQueryExecution` until the run finishes or an **overall wall-clock timeout** is exceeded (separate from **wait interval**).
- Configurable **overall timeout**, **wait interval**, and **`AbortSignal`** cancellation via `wait()` options; default overall cap is **`DEFAULT_TIMEOUT_MS`** (2 minutes).
- Typed errors: **`AthenaQueryExecutionWaiterTimeoutError`**, **`AthenaQueryExecutionWaiterAbortedError`**, **`AthenaQueryExecutionWaiterStateError`** (failed or cancelled runs), **`AthenaQueryExecutionWaiterMissingStateError`**, **`AthenaQueryExecutionWaiterUnsupportedStateError`**.
- Built for **AWS SDK for JavaScript v3** (`@aws-sdk/client-athena`).

## Installation

**@aws-sdk/client-athena** is a normal **dependency** of this package: installing `athena-query-execution-waiter` pulls in a compatible AWS SDK v3 Athena client. If your app also depends on `@aws-sdk/client-athena`, npm/yarn will dedupe when versions are compatible; otherwise you may have two copies under different semver ranges.

**yarn:**

```bash
yarn add athena-query-execution-waiter
```

**npm:**

```bash
npm install athena-query-execution-waiter
```

## Requirements

- **Node.js** >= 20.0.0
- **@aws-sdk/client-athena** — declared in this package’s `package.json` under `dependencies` (AWS SDK v3; version range is maintained there).

## Usage

```typescript
import { AthenaClient } from '@aws-sdk/client-athena';
import {
  AthenaQueryExecutionWaiter,
  DEFAULT_TIMEOUT_MS,
  AthenaQueryExecutionWaiterTimeoutError,
  AthenaQueryExecutionWaiterStateError,
} from 'athena-query-execution-waiter';

const client = new AthenaClient({ region: 'us-east-1' });
const waiter = new AthenaQueryExecutionWaiter(client);

// After StartQueryExecution, wait until the execution completes
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

### Overall timeout vs wait interval

| | Meaning |
|---|--------|
| **`waitOptions.timeoutMs` / `DEFAULT_TIMEOUT_MS`** | **Overall** wall-clock limit from when `wait()` starts until **SUCCEEDED**, **FAILED**, or **CANCELLED** (or this cap is exceeded). Omit `timeoutMs` to use `DEFAULT_TIMEOUT_MS`. This is **not** how often status is checked. |
| **`waitIntervalMs`** | Delay **between** `GetQueryExecution` calls. Independent of the overall timeout; a long wait interval still respects `waitOptions.timeoutMs` / `DEFAULT_TIMEOUT_MS`. |

Long-running jobs should pass a higher `timeoutMs` when needed:

```typescript
const state = await waiter.wait(queryExecutionId, {
  timeoutMs: 15 * 60_000, // 15 minutes overall
});
```

Default wait interval is **1 second**. Increase it to reduce API calls (constructor or per `wait()`):

```typescript
const waiter = new AthenaQueryExecutionWaiter(client, { waitIntervalMs: 5000 });

const state = await waiter.wait(queryExecutionId, {
  timeoutMs: 60_000,
  waitIntervalMs: 3000,
});
```

### Cancelling a wait with `AbortSignal`

Pass an `AbortSignal` to stop waiting early—for example on request teardown, deploy shutdown, or user cancellation:

```typescript
import {
  AthenaQueryExecutionWaiter,
  AthenaQueryExecutionWaiterAbortedError,
} from 'athena-query-execution-waiter';

const controller = new AbortController();

try {
  const state = await waiter.wait(queryExecutionId, {
    signal: controller.signal,
  });
  console.log('Query completed:', state);
} catch (err) {
  if (err instanceof AthenaQueryExecutionWaiterAbortedError) {
    console.error('Wait was aborted');
  }
  throw err;
}

// Elsewhere: controller.abort();
```

Waiting stops when the signal is aborted—before the next status check, after a status check returns, or during the wait interval.

## Options

### `AthenaQueryExecutionWaiterOptions` (constructor)

Passed to `new AthenaQueryExecutionWaiter(client, options?)`.

| Option | Type | Description |
|--------|------|-------------|
| `waitIntervalMs` | `number` (optional) | Default milliseconds **between** `GetQueryExecution` calls when `wait()` omits `waitIntervalMs`. Default: `1000`. |

### `AthenaQueryExecutionWaitOptions` (`wait()`)

Passed to `wait(queryExecutionId, waitOptions?)`.

| Option | Type | Description |
|--------|------|-------------|
| `timeoutMs` | `number` (optional) | **Overall** wall-clock timeout in ms from the start of `wait()` until a terminal state. Default: `DEFAULT_TIMEOUT_MS` (**2 minutes**). |
| `waitIntervalMs` | `number` (optional) | Milliseconds **between** status checks for this call. Default: constructor’s `waitIntervalMs` or `1000`. |
| `signal` | `AbortSignal` (optional) | When aborted, waiting stops and `AthenaQueryExecutionWaiterAbortedError` is thrown. |

## API reference

### `AthenaQueryExecutionWaiter`

- **Constructor:** `new AthenaQueryExecutionWaiter(client: AthenaClient, options?: AthenaQueryExecutionWaiterOptions)`
- **`wait(queryExecutionId: string, waitOptions?: AthenaQueryExecutionWaitOptions): Promise<QueryExecutionState>`**
  - **Returns** `SUCCEEDED` on success.
  - **Throws** `AthenaQueryExecutionWaiterTimeoutError` if overall wait exceeds the effective timeout.
  - **Throws** `AthenaQueryExecutionWaiterAbortedError` when `waitOptions.signal` is aborted.
  - **Throws** `AthenaQueryExecutionWaiterStateError` when the state is `FAILED` or `CANCELLED`.
  - **Throws** `AthenaQueryExecutionWaiterMissingStateError` when `QueryExecution`, `Status`, or `State` is missing from the API response (fail-fast; does not keep waiting until timeout).
  - **Throws** `AthenaQueryExecutionWaiterUnsupportedStateError` when `State` is present but not a known `QueryExecutionState` (e.g. a future Athena enum value).

### Constants

- **`DEFAULT_TIMEOUT_MS`** — Default overall wait cap in milliseconds (2 minutes) when `waitOptions.timeoutMs` is omitted. Safe to import for your own guards or logging.

### Errors

- **`AthenaQueryExecutionWaiterError`** — Base class for waiter errors.
- **`AthenaQueryExecutionWaiterTimeoutError`** — Overall elapsed time since `wait()` started exceeded `waitOptions.timeoutMs` or `DEFAULT_TIMEOUT_MS`. Constructor: `(elapsedTime: number)`.
- **`AthenaQueryExecutionWaiterAbortedError`** — Wait was cancelled via `AbortSignal`. Property: `signal`. Constructor: `(signal?: AbortSignal)`.
- **`AthenaQueryExecutionWaiterStateError`** — Query ended in `FAILED` or `CANCELLED`. Properties: `state`, `reason`. Constructor: `(state: QueryExecutionState, reason?: string)`.
- **`AthenaQueryExecutionWaiterMissingStateError`** — `GetQueryExecution` response is missing `QueryExecution`, `Status`, or `State`. Property: `detail`. Fails on the first status check.
- **`AthenaQueryExecutionWaiterUnsupportedStateError`** — `State` is not one of the known values (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`). Property: `state`. Fails on the first status check.

## License

This project is licensed under the Apache-2.0 License.
