import { typescript, javascript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  defaultReleaseBranch: 'main',
  name: 'athena-query-execution-waiter',
  projenrcTs: true,
  typescriptVersion: '5.9.x',
  repository: 'https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter.git',
  description: 'A small library that waits for an AWS Athena query execution to complete. It polls the Athena API until the execution reaches a terminal state: SUCCEEDED, FAILED, or CANCELLED.',
  keywords: [
    'aws',
    'aws-sdk',
    'athena',
    'query',
    'execution',
    'waiter',
  ],
  packageManager: javascript.NodePackageManager.YARN_CLASSIC,
  deps: [
    '@aws-sdk/client-athena@^3.983.0',
  ],
  releaseToNpm: true,
  npmTrustedPublishing: true,
  npmAccess: javascript.NpmAccess.PUBLIC,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      schedule: javascript.UpgradeDependenciesSchedule.WEEKLY,
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
        workflows: github.workflows.AppPermission.WRITE,
      },
    }),
  },
  autoApproveOptions: {
    allowedUsernames: [
      'gammarers-projen-upgrade-bot[bot]',
      'yicr',
    ],
  },
});
project.package.addField('packageManager', 'yarn@1.22.22');
project.addPackageIgnore('/.devcontainer');
project.synth();