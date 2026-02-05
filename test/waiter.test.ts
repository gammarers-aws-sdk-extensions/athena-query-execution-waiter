import { AthenaQueryExecutionWaiter } from '../src/index';

describe('AthenaQueryExecutionWaiter', () => {
  const queryExecutionId = 'test-query-id';

  describe('wait', () => {
    it('returns "SUCCEEDED" when state is SUCCEEDED', async () => {
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

    it('throws Error with reason when state is FAILED', async () => {
      const reason = 'Table not found';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'FAILED', StateChangeReason: reason },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(waiter.wait(queryExecutionId)).rejects.toThrow(
        `Athena query FAILED: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('throws Error with reason when state is CANCELLED', async () => {
      const reason = 'User cancelled';
      const mockSend = jest.fn().mockResolvedValue({
        QueryExecution: {
          Status: { State: 'CANCELLED', StateChangeReason: reason },
        },
      });
      const client = { send: mockSend } as any;
      const waiter = new AthenaQueryExecutionWaiter(client);

      await expect(waiter.wait(queryExecutionId)).rejects.toThrow(
        `Athena query CANCELLED: ${reason}`,
      );
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('returns "SUCCEEDED" after RUNNING then SUCCEEDED', async () => {
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
  });
});
