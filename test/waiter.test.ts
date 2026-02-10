import {
  AthenaQueryExecutionWaiter,
  AthenaQueryExecutionWaiterStateError,
  AthenaQueryExecutionWaiterTimeoutError,
} from '../src/index';

describe('AthenaQueryExecutionWaiter', () => {
  const queryExecutionId = 'test-query-id';

  describe('wait', () => {
    it('should return "SUCCEEDED" when state is SUCCEEDED', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'SUCCEEDED' },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      const result = await waiter.wait(queryExecutionId);

      expect(result).toBe('SUCCEEDED');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterStateError with reason when state is FAILED', async () => {
      const reason = 'Table not found';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'FAILED', StateChangeReason: reason },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterStateError);
      expect((err as Error).message).toBe(
        `Athena query execution failed with state FAILED: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw AthenaQueryExecutionWaiterStateError with reason when state is CANCELLED', async () => {
      const reason = 'User cancelled';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'CANCELLED', StateChangeReason: reason },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterStateError);
      expect((err as Error).message).toBe(
        `Athena query execution failed with state CANCELLED: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return "SUCCEEDED" after RUNNING then SUCCEEDED', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: {
            Status: { State: 'RUNNING' },
          },
        })
        .mockResolvedValueOnce({
          QueryExecution: {
            Status: { State: 'SUCCEEDED' },
          },
        });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      const result = await waiter.wait(queryExecutionId);

      expect(result).toBe('SUCCEEDED');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should throw AthenaQueryExecutionWaiterTimeoutError when timeout is exceeded', async () => {
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'RUNNING' },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);
      const timeoutMs = 100;

      let err: unknown;
      try {
        await waiter.wait(queryExecutionId, timeoutMs, { pollIntervalMs: 10 });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(AthenaQueryExecutionWaiterTimeoutError);
      expect((err as Error).message).toMatch(/Athena query timed out after \d+ms/);
      expect(mockSend).toHaveBeenCalled();
    });

    it('should use pollIntervalMs from constructor options', async () => {
      const pollIntervalMs = 200;
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: 'RUNNING' } },
        })
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: 'SUCCEEDED' } },
        });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client, { pollIntervalMs });

      jest.useFakeTimers();
      const p = waiter.wait(queryExecutionId);
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(pollIntervalMs);
      const result = await p;
      jest.useRealTimers();

      expect(result).toBe('SUCCEEDED');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should use pollIntervalMs from wait() options and override constructor default', async () => {
      const mockSend = jest
        .fn()
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: 'RUNNING' } },
        })
        .mockResolvedValueOnce({
          QueryExecution: { Status: { State: 'SUCCEEDED' } },
        });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client, { pollIntervalMs: 5000 });
      const callPollIntervalMs = 150;

      jest.useFakeTimers();
      const p = waiter.wait(queryExecutionId, 10000, { pollIntervalMs: callPollIntervalMs });
      await Promise.resolve();
      expect(mockSend).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(callPollIntervalMs);
      const result = await p;
      jest.useRealTimers();

      expect(result).toBe('SUCCEEDED');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});
