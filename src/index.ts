import { GetQueryExecutionCommand, QueryExecutionState, AthenaClient } from '@aws-sdk/client-athena';

const WAIT_TIME_MS = 1000;

const DEFAULT_TIMEOUT_MS = 1000 * 10;

export class AthenaQueryExecutionWaiter {

  constructor(private readonly client: AthenaClient) {}

  async wait(queryExecutionId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<QueryExecutionState> {
    const startTime = Date.now();
    do {
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime > timeoutMs) {
        throw new Error(`Athena query timed out after ${elapsedTime}ms`);
      }

      const res = await this.client.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }));
      const st = res.QueryExecution?.Status;
      const state = st?.State as QueryExecutionState | undefined;
      const reason = st?.StateChangeReason ?? '';

      if (state === QueryExecutionState.SUCCEEDED) {
        return QueryExecutionState.SUCCEEDED;
      }
      if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
        throw new Error(`Athena query ${state}: ${reason}`);
      }
      await new Promise((r) => setTimeout(r, WAIT_TIME_MS));
    } while (true);
  }
}
