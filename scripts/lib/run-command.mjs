import { spawn } from 'node:child_process';

export function runCommand(command, args = [], options = {}) {
  const {
    cwd,
    env,
    stdio = 'inherit',
    allowFailure = false,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio,
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure) {
        resolve(code ?? 0);
        return;
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(' ')} (exit ${code ?? 'unknown'})`,
        ),
      );
    });
  });
}

export async function captureCommand(command, args = [], options = {}) {
  let stdout = '';
  let stderr = '';

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 0));
  });

  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      stderr.trim() ||
        stdout.trim() ||
        `Command failed: ${command} ${args.join(' ')}`,
    );
  }

  return {
    code: exitCode,
    stdout,
    stderr,
  };
}
