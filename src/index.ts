import { GetQueryExecutionCommand, QueryExecutionState, AthenaClient } from '@aws-sdk/client-athena';

export class AthenaQueryExecutionWaiter {

  constructor(private readonly client: AthenaClient) {}

  async wait(queryExecutionId: string) {
    // const startTime = Date.now();
    while (true) {
      // if (Date.now() - startTime > timeoutMs) {
      //   throw new Error(`Athena query timed out after ${timeoutMs}ms`);
      // }

      const res = await this.client.send(new GetQueryExecutionCommand({
        QueryExecutionId: queryExecutionId,
      }));
      const st = res.QueryExecution?.Status;
      const state = st?.State as QueryExecutionState | undefined;
      const reason = st?.StateChangeReason ?? '';

      if (state === 'SUCCEEDED') return 'SUCCEEDED';
      if (state === 'FAILED' || state === 'CANCELLED') {
        throw new Error(`Athena query ${state}: ${reason}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
