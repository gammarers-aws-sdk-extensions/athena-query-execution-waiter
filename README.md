# Athena Query Execution Waiter

[![npm version](https://img.shields.io/npm/v/athena-query-execution-waiter.svg)](https://www.npmjs.com/package/athena-query-execution-waiter)
[![License](https://img.shields.io/npm/l/athena-query-execution-waiter.svg)](https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter/blob/main/LICENSE)

A small library that waits for an AWS Athena query execution to complete. It polls the Athena API until the execution reaches a terminal state: **SUCCEEDED**, **FAILED**, or **CANCELLED**.

## Features

- Polls `GetQueryExecution` until the run finishes or an **overall wall-clock timeout** is exceeded (separate from **polling interval**).
- Configurable **overall timeout** and **poll spacing** via `wait()` options; default overall cap is **`DEFAULT_TIMEOUT_MS`** (2 minutes).
- Typed errors: **`AthenaQueryExecutionWaiterTimeoutError`**, **`AthenaQueryExecutionWaiterStateError`** (failed or cancelled runs).
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

### Overall timeout vs polling interval

| | Meaning |
|---|--------|
| **`waitOptions.timeoutMs` / `DEFAULT_TIMEOUT_MS`** | **Overall** wall-clock limit from when `wait()` starts until **SUCCEEDED**, **FAILED**, or **CANCELLED** (or this cap is exceeded). Omit `timeoutMs` to use `DEFAULT_TIMEOUT_MS`. This is **not** how often Athena is polled. |
| **`pollIntervalMs`** | Delay **between** `GetQueryExecution` calls. Independent of the overall timeout; a long poll interval still respects `waitOptions.timeoutMs` / `DEFAULT_TIMEOUT_MS`. |

Long-running jobs should pass a higher `timeoutMs` when needed:

```typescript
const state = await waiter.wait(queryExecutionId, {
  timeoutMs: 15 * 60_000, // 15 minutes overall
});
```

Default polling interval is **1 second**. Increase it to reduce API calls (constructor or per `wait()`):

```typescript
const waiter = new AthenaQueryExecutionWaiter(client, { pollIntervalMs: 5000 });

const state = await waiter.wait(queryExecutionId, {
  timeoutMs: 60_000,
  pollIntervalMs: 3000,
});
```

## Options

### `AthenaQueryExecutionWaiterOptions` (constructor)

Passed to `new AthenaQueryExecutionWaiter(client, options?)`.

| Option | Type | Description |
|--------|------|-------------|
| `pollIntervalMs` | `number` (optional) | Default milliseconds **between** `GetQueryExecution` calls when `wait()` omits `pollIntervalMs`. Default: `1000`. |

### `AthenaQueryExecutionWaitOptions` (`wait()`)

Passed to `wait(queryExecutionId, waitOptions?)`.

| Option | Type | Description |
|--------|------|-------------|
| `timeoutMs` | `number` (optional) | **Overall** wall-clock timeout in ms from the start of `wait()` until a terminal state. Default: `DEFAULT_TIMEOUT_MS` (**2 minutes**). |
| `pollIntervalMs` | `number` (optional) | Milliseconds **between** polls for this call. Default: constructor’s `pollIntervalMs` or `1000`. |

## API reference

### `AthenaQueryExecutionWaiter`

- **Constructor:** `new AthenaQueryExecutionWaiter(client: AthenaClient, options?: AthenaQueryExecutionWaiterOptions)`
- **`wait(queryExecutionId: string, waitOptions?: AthenaQueryExecutionWaitOptions): Promise<QueryExecutionState>`**
  - **Returns** `SUCCEEDED` on success.
  - **Throws** `AthenaQueryExecutionWaiterTimeoutError` if overall wait exceeds the effective timeout.
  - **Throws** `AthenaQueryExecutionWaiterStateError` when the state is `FAILED` or `CANCELLED`.

### Constants

- **`DEFAULT_TIMEOUT_MS`** — Default overall wait cap in milliseconds (2 minutes) when `waitOptions.timeoutMs` is omitted. Safe to import for your own guards or logging.

### Errors

- **`AthenaQueryExecutionWaiterError`** — Base class for waiter errors.
- **`AthenaQueryExecutionWaiterTimeoutError`** — Overall elapsed time since `wait()` started exceeded `waitOptions.timeoutMs` or `DEFAULT_TIMEOUT_MS`. Constructor: `(elapsedTime: number)`.
- **`AthenaQueryExecutionWaiterStateError`** — Query ended in `FAILED` or `CANCELLED`. Properties: `state`, `reason`. Constructor: `(state: QueryExecutionState, reason?: string)`.

## License

This project is licensed under the Apache-2.0 License.
