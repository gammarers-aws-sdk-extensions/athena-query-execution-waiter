# Athena Query Execution Waiter

[![npm version](https://img.shields.io/npm/v/athena-query-execution-waiter?style=flat-square)](https://www.npmjs.com/package/athena-query-execution-waiter)
[![license](https://img.shields.io/npm/l/athena-query-execution-waiter?style=flat-square)](https://www.npmjs.com/package/athena-query-execution-waiter)
[![Node.js](https://img.shields.io/node/v/athena-query-execution-waiter?style=flat-square)](https://www.npmjs.com/package/athena-query-execution-waiter)
[![build](https://img.shields.io/github/actions/workflow/status/gammarers-aws-sdk-extensions/athena-query-execution-waiter/build.yml?label=build&style=flat-square)](https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter/actions/workflows/build.yml)

A small library that waits for an AWS Athena query execution to complete. It repeatedly calls the Athena API until the execution reaches a terminal state: **SUCCEEDED**, **FAILED**, or **CANCELLED**.

## Features

- Waits on `GetQueryExecution` until the run finishes or an **overall wall-clock timeout** is exceeded (separate from **wait interval**).
- Configurable **overall timeout**, **wait interval**, and **`AbortSignal`** cancellation via `wait()` options; default overall cap is **`DEFAULT_TIMEOUT_MS`** (2 minutes).
- Typed errors: **`AthenaQueryExecutionWaiterTimeoutError`**, **`AthenaQueryExecutionWaiterAbortedError`**, **`AthenaQueryExecutionWaiterStateError`** (failed or cancelled runs), **`AthenaQueryExecutionWaiterMissingStateError`**, **`AthenaQueryExecutionWaiterUnsupportedStateError`**.
- Timeout errors include **`queryExecutionId`**, **`elapsedTime`**, and **`timeoutMs`** (in both properties and the message) so timeouts can be correlated in mixed logs.
- A missing or unknown execution state fails on that status check.
- Built for **AWS SDK for JavaScript v3** (`@aws-sdk/client-athena`).
- Throttling and transient `GetQueryExecution` errors follow the injected **`AthenaClient`** retry settings (`maxAttempts`, `retryMode`). After those attempts are exhausted, the SDK error propagates and `wait()` ends.

## How it works

Pass the query execution ID from `StartQueryExecution` to `wait()`, along with your `AthenaClient`. The waiter calls `GetQueryExecution`, then waits `waitIntervalMs` while the state is **QUEUED** or **RUNNING**.

**SUCCEEDED** is returned. **FAILED** and **CANCELLED** throw `AthenaQueryExecutionWaiterStateError`. If the overall wait exceeds `timeoutMs` or `DEFAULT_TIMEOUT_MS`, the waiter throws `AthenaQueryExecutionWaiterTimeoutError`. An aborted `AbortSignal` throws `AthenaQueryExecutionWaiterAbortedError`.

## Installation

### npm

```bash
npm install athena-query-execution-waiter
```

### yarn

```bash
yarn add athena-query-execution-waiter
```

### pnpm

```bash
pnpm add athena-query-execution-waiter
```

`@aws-sdk/client-athena` is a dependency of this package. If your app also depends on it, the package manager dedupes compatible versions.

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

// After StartQueryExecution, wait until the execution completes
const queryExecutionId = 'your-query-execution-id';

try {
  const state = await waiter.wait(queryExecutionId);
  console.log('Query completed:', state); // "SUCCEEDED"
} catch (err) {
  if (err instanceof AthenaQueryExecutionWaiterTimeoutError) {
    console.error(
      'Query timed out',
      err.queryExecutionId,
      err.elapsedTime,
      err.timeoutMs,
    );
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

### Retries and throttling

This library does not add its own retry loop. `GetQueryExecution` is sent through the `AthenaClient` you pass in, so throttling and other transient failures are retried only by that client. Configure retries when you construct the client:

```typescript
import { AthenaClient } from '@aws-sdk/client-athena';

const client = new AthenaClient({
  region: 'us-east-1',
  maxAttempts: 10,
  retryMode: 'adaptive',
});
```

`maxAttempts` is the total number of attempts per `GetQueryExecution` call (the SDK default is `3`). `retryMode: 'adaptive'` backs off using client-side rate limiting; `'standard'` uses exponential backoff with jitter. The SDK retries errors it classifies as retryable—throttling, transient 5xx responses, and network failures. Errors it does not retry, such as access denied or an invalid query execution ID, leave `wait()` immediately.

### Errors

Catch a concrete subclass before the abstract base `AthenaQueryExecutionWaiterError`.

| Error | When |
|--------|------|
| `AthenaQueryExecutionWaiterTimeoutError` | Overall wait exceeded `timeoutMs` or `DEFAULT_TIMEOUT_MS`. Properties: `queryExecutionId`, `elapsedTime`, `timeoutMs`. |
| `AthenaQueryExecutionWaiterAbortedError` | `AbortSignal` aborted. Property: `signal`. |
| `AthenaQueryExecutionWaiterStateError` | State is `FAILED` or `CANCELLED`. Properties: `state`, `reason` (`unknown` when Athena omits it). |
| `AthenaQueryExecutionWaiterMissingStateError` | `QueryExecution`, `Status`, or `State` is missing. Fails on that status check. Property: `detail`. |
| `AthenaQueryExecutionWaiterUnsupportedStateError` | `State` is not a known `QueryExecutionState`. Fails on that status check. Property: `state`. |

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

## Requirements

- Node.js >= 20.0.0

## License

This project is licensed under the Apache-2.0 License.
