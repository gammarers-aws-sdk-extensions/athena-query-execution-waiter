import { AthenaClient, QueryExecutionState } from '@aws-sdk/client-athena';
import {
  AthenaQueryExecutionWaiter,
  AthenaQueryExecutionWaiterAbortedError,
  AthenaQueryExecutionWaiterMissingStateError,
  AthenaQueryExecutionWaiterStateError,
  AthenaQueryExecutionWaiterTimeoutError,
  AthenaQueryExecutionWaiterUnsupportedStateError,
} from '../src/index';

/**
 * AthenaClient is a class. Tests only call `send`, so the double is asserted
 * at that boundary instead of using `any`.
 */
const asClient = (send: unknown): AthenaClient => ({ send } as unknown as AthenaClient);

describe('AthenaQueryExecutionWaiter', () => {
  const queryExecutionId = 'test-query-id';

  describe('wait', () => {
    it('should return "SUCCEEDED" when state is SUCCEEDED', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.SUCCEEDED },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      const result = await waiter.wait(queryExecutionId);

      expect(result).toBe(QueryExecutionState.SUCCEEDED);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterStateError with reason when state is FAILED', async () => {
      const reason = 'Table not found';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.FAILED, StateChangeReason: reason },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterStateError);
      expect((err as Error).message).toBe(
        `Athena query execution failed with state ${QueryExecutionState.FAILED}: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterStateError with reason when state is CANCELLED', async () => {
      const reason = 'User cancelled';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.CANCELLED, StateChangeReason: reason },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterStateError);
      expect((err as Error).message).toBe(
        `Athena query execution failed with state ${QueryExecutionState.CANCELLED}: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterMissingStateError when QueryExecution is missing', async () => {
      const mockSend = jest.fn().mockResolvedValue({});
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(waiter.wait(queryExecutionId)).rejects.toBeInstanceOf(
        AthenaQueryExecutionWaiterMissingStateError,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterMissingStateError when State is missing', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: { Status: {} },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(waiter.wait(queryExecutionId)).rejects.toBeInstanceOf(
        AthenaQueryExecutionWaiterMissingStateError,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterUnsupportedStateError for unknown state', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: { Status: { State: 'FUTURE_STATE' } },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(waiter.wait(queryExecutionId)).rejects.toBeInstanceOf(
        AthenaQueryExecutionWaiterUnsupportedStateError,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return "SUCCEEDED" after RUNNING then SUCCEEDED', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: {
            Status: { State: QueryExecutionState.RUNNING },
          },
        })
        .mockResolvedValueOnce({
          QueryExecution: {
            Status: { State: QueryExecutionState.SUCCEEDED },
          },
        });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      const result = await waiter.wait(queryExecutionId);

      expect(result).toBe(QueryExecutionState.SUCCEEDED);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw AthenaQueryExecutionWaiterTimeoutError when timeout is exceeded', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.RUNNING },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);
      const timeoutMs = 100;

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId, { timeoutMs, waitIntervalMs: 10 });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterTimeoutError);
      const timeoutErr = err as AthenaQueryExecutionWaiterTimeoutError;
      expect(timeoutErr.queryExecutionId).toBe(queryExecutionId);
      expect(timeoutErr.timeoutMs).toBe(timeoutMs);
      expect(timeoutErr.elapsedTime).toBeGreaterThan(timeoutMs);
      expect(timeoutErr.message).toBe(
        `Athena query execution ${queryExecutionId} timed out after ${timeoutErr.elapsedTime}ms (timeoutMs: ${timeoutMs})`,
      );
      expect(mockSend).toHaveBeenCalled();
    });

    it('should use waitOptions.timeoutMs when provided', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.RUNNING },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client, { waitIntervalMs: 10 });

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId, { timeoutMs: 120 });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterTimeoutError);
      const timeoutErr = err as AthenaQueryExecutionWaiterTimeoutError;
      expect(timeoutErr.queryExecutionId).toBe(queryExecutionId);
      expect(timeoutErr.timeoutMs).toBe(120);
      expect(timeoutErr.elapsedTime).toBeGreaterThan(120);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should use waitIntervalMs from constructor options', async () => {
      const waitIntervalMs = 200;
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: QueryExecutionState.RUNNING } },
        })
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: QueryExecutionState.SUCCEEDED } },
        });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client, { waitIntervalMs });

      jest.useFakeTimers();
      const p = waiter.wait(queryExecutionId);
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(waitIntervalMs);
      const result = await p;
      jest.useRealTimers();

      expect(result).toBe(QueryExecutionState.SUCCEEDED);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should use waitIntervalMs from wait() options and override constructor default', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: QueryExecutionState.RUNNING } },
        })
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: QueryExecutionState.SUCCEEDED } },
        });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client, { waitIntervalMs: 5000 });
      const callWaitIntervalMs = 150;

      jest.useFakeTimers();
      const p = waiter.wait(queryExecutionId, {
        timeoutMs: 10000,
        waitIntervalMs: callWaitIntervalMs,
      });
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(callWaitIntervalMs);
      const result = await p;
      jest.useRealTimers();

      expect(result).toBe(QueryExecutionState.SUCCEEDED);
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw AthenaQueryExecutionWaiterAbortedError when signal is already aborted', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.RUNNING },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);
      const controller = new AbortController();
      controller.abort();

      await expect(
        waiter.wait(queryExecutionId, { signal: controller.signal }),
      ).rejects.toBeInstanceOf(AthenaQueryExecutionWaiterAbortedError);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should throw AthenaQueryExecutionWaiterAbortedError when signal is aborted during wait interval', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: QueryExecutionState.RUNNING },
        },
      });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);
      const controller = new AbortController();
      const waitIntervalMs = 200;

      jest.useFakeTimers();
      const p = waiter.wait(queryExecutionId, {
        waitIntervalMs,
        signal: controller.signal,
      });
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalledTimes(1);

      controller.abort();
      jest.advanceTimersByTime(waitIntervalMs);

      await expect(p).rejects.toBeInstanceOf(AthenaQueryExecutionWaiterAbortedError);
      jest.useRealTimers();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterAbortedError when signal is aborted after API response', async () => {
      const controller = new AbortController();
      const mockSend = jest
        .fn()
        .mockImplementation(async () => {
          controller.abort();
          return {
            QueryExecution: {
              Status: { State: QueryExecutionState.RUNNING },
            },
          };
        });
      const client = asClient(mockSend);
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(
        waiter.wait(queryExecutionId, { signal: controller.signal }),
      ).rejects.toBeInstanceOf(AthenaQueryExecutionWaiterAbortedError);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
