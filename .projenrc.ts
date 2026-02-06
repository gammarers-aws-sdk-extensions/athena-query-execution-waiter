import { typescript, javascript, github } from 'projen';
const project = new typescript.TypeScriptProject({
  authorName: 'yicr',
  authorEmail: 'yicr@users.noreply.github.com',
  defaultReleaseBranch: 'main',
  name: 'athena-query-execution-waiter',
  projenrcTs: true,
  typescriptVersion: '5.9.x',
  repository: 'https://github.com/gammarers-aws-sdk-extensions/athena-query-execution-waiter.git',
  deps: [
    '@aws-sdk/client-athena@^3.983.0',
  ],
  releaseToNpm: false,
  npmAccess: javascript.NpmAccess.PUBLIC,
  minNodeVersion: '20.0.0',
  workflowNodeVersion: '24.x',
  depsUpgradeOptions: {
    workflowOptions: {
      labels: ['auto-approve', 'auto-merge'],
      // schedule: javascript.UpgradeDependenciesSchedule.expressions(['15 16 * * 5']),
    },
  },
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({
      permissions: {
        pullRequests: github.workflows.AppPermission.WRITE,
        contents: github.workflows.AppPermission.WRITE,
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
project.synth();