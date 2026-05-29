import readline from 'node:readline/promises';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function colorize(color, value) {
  return `${COLORS[color]}${value}${COLORS.reset}`;
}

export function createPrompter() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function isClosedStreamError(error) {
  return (
    error?.code === 'ERR_USE_AFTER_CLOSE' ||
    /readline was closed/i.test(error?.message ?? '')
  );
}

export async function promptText(prompter, label, defaultValue = '') {
  const suffix = defaultValue ? ` ${colorize('dim', `(${defaultValue})`)}` : '';
  let answer;
  try {
    answer = await prompter.question(
      `${colorize('cyan', '?')} ${label}${suffix}: `,
    );
  } catch (error) {
    if (isClosedStreamError(error)) {
      return defaultValue;
    }
    throw error;
  }
  return answer.trim() || defaultValue;
}

export async function promptConfirm(prompter, label, defaultValue = true) {
  const hint = defaultValue ? 'Y/n' : 'y/N';
  let raw;
  try {
    raw = await prompter.question(
      `${colorize('cyan', '?')} ${label} ${colorize('dim', `(${hint})`)}: `,
    );
  } catch (error) {
    if (isClosedStreamError(error)) {
      return defaultValue;
    }
    throw error;
  }

  const answer = raw.trim().toLowerCase();

  if (!answer) {
    return defaultValue;
  }

  return answer === 'y' || answer === 'yes';
}

export function clearScreen() {
  if (process.stdout.isTTY) {
    process.stdout.write('\x1Bc');
  }
}

function renderProgressBar(completed, total) {
  const width = 28;
  const ratio = total === 0 ? 0 : completed / total;
  const filled = Math.round(width * ratio);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}] ${completed}/${total}`;
}

function iconForStatus(status) {
  switch (status) {
    case 'running':
      return colorize('yellow', '●');
    case 'done':
      return colorize('green', '●');
    case 'failed':
      return colorize('red', '●');
    default:
      return colorize('dim', '○');
  }
}

export function renderInstallerScreen({ title, steps, currentMessage = '' }) {
  clearScreen();

  const completed = steps.filter((step) => step.status === 'done').length;
  const total = steps.length;

  console.log(colorize('bold', title));
  console.log(colorize('dim', renderProgressBar(completed, total)));
  console.log('');

  for (const step of steps) {
    console.log(`${iconForStatus(step.status)} ${step.label}`);
  }

  if (currentMessage) {
    console.log('');
    console.log(currentMessage);
  }
}

export function renderSection(title, lines = []) {
  console.log('');
  console.log(colorize('bold', title));
  for (const line of lines) {
    console.log(line);
  }
}

export function renderSuccess({ repoDir, packageName }) {
  clearScreen();
  console.log(colorize('bold', 'Starter Setup Complete'));
  console.log(colorize('green', 'Your workspace is ready.'));
  console.log('');
  console.log(`Directory: ${repoDir}`);
  console.log(`Root package: ${packageName}`);
  console.log('');
  console.log(colorize('bold', 'Next Steps'));
  console.log(`cd ${repoDir}`);
  console.log('pnpm dev');
  console.log('pnpm start');
}

export function renderFailure(message) {
  console.log('');
  console.log(colorize('red', 'Setup failed'));
  console.log(message);
}
