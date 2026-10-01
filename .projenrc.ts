import { ProjenTypeScriptProject } from '@gammarers/projen-projects';
const project = new ProjenTypeScriptProject({
  name: 'athena-query-execution-waiter',
  repositoryUrl: 'https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter.git',
  description: 'A small library that waits for an AWS Athena query execution to complete. It repeatedly checks the Athena API until the execution reaches a terminal state: SUCCEEDED, FAILED, or CANCELLED.',
  keywords: [
    'aws',
    'aws-sdk',
    'athena',
    'query',
    'execution',
    'waiter',
  ],
  deps: [
    '@aws-sdk/client-athena@^3.983.0',
  ],
  devDeps: [
    '@gammarers/projen-projects@^0.5.0',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
});
project.synth();