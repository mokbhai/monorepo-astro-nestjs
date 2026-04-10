#!/usr/bin/env node

import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  customizeRootPackageName,
  validatePackageName,
} from './lib/customize-root-package.mjs';
import { removeInstallerArtifacts } from './lib/remove-installer-artifacts.mjs';
import { captureCommand, runCommand } from './lib/run-command.mjs';
import {
  createPrompter,
  promptConfirm,
  promptText,
  renderFailure,
  renderInstallerScreen,
  renderSection,
  renderSuccess,
} from './lib/tui.mjs';

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveGitIdentity(repoDir, prompter) {
  const [nameResult, emailResult] = await Promise.all([
    captureCommand('git', ['config', '--global', '--get', 'user.name'], {
      cwd: repoDir,
      allowFailure: true,
    }),
    captureCommand('git', ['config', '--global', '--get', 'user.email'], {
      cwd: repoDir,
      allowFailure: true,
    }),
  ]);

  let gitName = nameResult.stdout.trim();
  let gitEmail = emailResult.stdout.trim();

  if (!gitName) {
    gitName = await promptText(prompter, 'Git user name');
  }

  if (!gitEmail) {
    gitEmail = await promptText(prompter, 'Git email');
  }

  if (!gitName || !gitEmail) {
    throw new Error('Git user name and email are required to create the first commit.');
  }

  return { gitName, gitEmail };
}

async function main() {
  const repoDir = process.cwd();
  const rootPackageJsonPath = path.join(repoDir, 'package.json');

  if (!(await pathExists(rootPackageJsonPath))) {
    throw new Error('Run this installer from the root of the cloned starter repository.');
  }

  const prompter = createPrompter();

  try {
    renderSection('Starter Bootstrap', [
      'This will customize the root package, install dependencies,',
      'reset git history, and create the first commit.',
    ]);

    let packageName = '';

    while (true) {
      packageName = await promptText(
        prompter,
        'Root package name',
        path.basename(repoDir).toLowerCase(),
      );

      const validation = validatePackageName(packageName);
      if (validation.valid) {
        packageName = validation.normalized;
        break;
      }

      renderFailure(validation.message);
    }

    const gitIdentity = await resolveGitIdentity(repoDir, prompter);

    renderSection('Summary', [
      `Directory: ${repoDir}`,
      `Root package: ${packageName}`,
      `Git user: ${gitIdentity.gitName} <${gitIdentity.gitEmail}>`,
    ]);

    const confirmed = await promptConfirm(prompter, 'Start setup now?', true);
    if (!confirmed) {
      console.log('Setup cancelled.');
      return;
    }

    const steps = [
      {
        label: 'Rename root package',
        status: 'pending',
        run: async () =>
          customizeRootPackageName({
            repoDir,
            packageName,
          }),
      },
      {
        label: 'Install dependencies',
        status: 'pending',
        run: async () => runCommand('pnpm', ['install'], { cwd: repoDir }),
      },
      {
        label: 'Remove starter git history',
        status: 'pending',
        run: async () => rm(path.join(repoDir, '.git'), { recursive: true, force: true }),
      },
      {
        label: 'Initialize fresh git repository',
        status: 'pending',
        run: async () => {
          await runCommand('git', ['init'], { cwd: repoDir });
          await runCommand('git', ['branch', '-M', 'main'], { cwd: repoDir });
          await runCommand('git', ['config', 'user.name', gitIdentity.gitName], {
            cwd: repoDir,
          });
          await runCommand('git', ['config', 'user.email', gitIdentity.gitEmail], {
            cwd: repoDir,
          });
        },
      },
      {
        label: 'Remove installer files',
        status: 'pending',
        run: async () => removeInstallerArtifacts({ repoDir }),
      },
      {
        label: 'Create initial commit',
        status: 'pending',
        run: async () => {
          await runCommand('git', ['add', '.'], { cwd: repoDir });
          await runCommand(
            'git',
            ['commit', '-m', 'chore: initialize project'],
            { cwd: repoDir },
          );
        },
      },
    ];

    for (const step of steps) {
      step.status = 'running';
      renderInstallerScreen({
        title: 'Starter Installer',
        steps,
        currentMessage: `Running: ${step.label}`,
      });

      try {
        await step.run();
        step.status = 'done';
      } catch (error) {
        step.status = 'failed';
        renderInstallerScreen({
          title: 'Starter Installer',
          steps,
          currentMessage: `Stopped at: ${step.label}`,
        });
        renderFailure(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
        return;
      }
    }

    renderSuccess({ repoDir, packageName });
  } finally {
    prompter.close();
  }
}

await main();
