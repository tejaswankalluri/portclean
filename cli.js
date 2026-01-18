#!/usr/bin/env node

import { execSync } from 'child_process';
import { kill } from 'process';
import { stdin, stdout } from 'process';
import parseArgs from 'mri';
import colors from 'picocolors';
import * as readline from 'readline';

const VERSION = '1.0.0';
const PLATFORM = process.platform;

// Parse ports (single numbers or inclusive ranges like 3000-3010)
function parsePorts(inputs) {
  const ports = new Set();
  const errors = [];

  for (const input of inputs) {
    if (typeof input !== 'string') {
      errors.push(`Invalid port input: ${input}`);
      continue;
    }

    if (input.includes('-')) {
      const [startStr, endStr] = input.split('-', 2);
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);

      if (Number.isNaN(start) || Number.isNaN(end) || start < 1 || end > 65535 || start > end) {
        errors.push(`Error: Invalid port range ${input}`);
        continue;
      }

      for (let p = start; p <= end; p++) {
        ports.add(p);
      }
      continue;
    }

    const port = parseInt(input, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      errors.push(`Error: Invalid port ${input}`);
      continue;
    }
    ports.add(port);
  }

  return { ports: Array.from(ports), errors };
}

async function main() {
  const args = parseArgs(process.argv.slice(2), {
    alias: {
      h: 'help',
      v: 'version',
      f: 'force',
      a: 'all',
    },
  });

  if (args.help) {
    console.log(`
${colors.bold('portclean')} - Kill processes using specific ports

${colors.bold('Usage:')}
  portclean [ports...] [options]

${colors.bold('Arguments:')}
  ports         Port number(s) or ranges to target (e.g. 3000 or 3000-3010)

${colors.bold('Options:')}
  --force, -f   Skip confirmation prompt
  --all, -a     Kill all processes using each port
  --help, -h    Show this help message
  --version, -v Show version number

${colors.bold('Examples:')}
  portclean 3000                    Kill process on port 3000
  portclean 3000 8080 9000          Kill processes on multiple ports
  portclean 3000-3010               Kill processes on ports 3000 through 3010
  portclean 3000 --force            Kill port 3000 without confirmation
  portclean 3000 --all              Kill all processes using port 3000
  portclean 3000 8080 --force --all Kill all processes on both ports without confirmation
`);
    process.exit(0);
  }

  if (args.version) {
    console.log(`portkill v${VERSION}`);
    process.exit(0);
  }

  const rawPorts = args._;

  if (rawPorts.length === 0) {
    console.error(colors.red('Error: No ports specified'));
    process.exit(1);
  }

  const { ports, errors: portErrors } = parsePorts(rawPorts);
  portErrors.forEach((msg) => console.error(colors.red(msg)));

  if (ports.length === 0) {
    process.exit(1);
  }

  for (const port of ports) {
    await handlePort(port, args);
  }

  process.exit(0);
}

/**
 * Handle killing processes on a specific port
 */
async function handlePort(port, args) {
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(colors.red(`Error: Invalid port ${port}`));
    return;
  }

  try {
    const processes = await getProcessesOnPort(port);

    if (processes.length === 0) {
      console.log(colors.yellow(`No process found on port ${port}`));
      return;
    }

    console.log(colors.cyan(`\nProcesses on port ${port}:`));
    processes.forEach((proc, idx) => {
      console.log(`  ${idx + 1}. PID ${proc.pid} (${proc.command})`);
    });

    if (args.force || args.all) {
      // If --force or --all, show single confirmation per port (or none with --force)
      if (args.force) {
        for (const proc of processes) {
          await killProcess(proc.pid, proc.command);
        }
      } else if (args.all) {
        const confirmed = await prompt(
          `Kill all ${processes.length} process(es) on port ${port}? (Y/n) `
        );
        if (confirmed) {
          for (const proc of processes) {
            await killProcess(proc.pid, proc.command);
          }
        }
      }
    } else {
      for (const proc of processes) {
        const confirmed = await prompt(
          `Process ${proc.pid} (${proc.command}) is using port ${port}. Kill it? (Y/n) `
        );
        if (confirmed) {
          await killProcess(proc.pid, proc.command);
        }
      }
    }
  } catch (error) {
    console.error(colors.red(`Failed to handle port ${port}: ${error.message}`));
  }
}

/**
 * Get processes using a specific port
 */
async function getProcessesOnPort(port) {
  if (PLATFORM === 'darwin' || PLATFORM === 'linux') {
    return await getProcessesPosix(port);
  } else if (PLATFORM === 'win32') {
    return await getProcessesWindows(port);
  } else {
    throw new Error(`Unsupported platform: ${PLATFORM}`);
  }
}

/**
 * Get processes on macOS/Linux using lsof or netstat
 */
async function getProcessesPosix(port) {
  // Suppress stderr from system commands to avoid leaking raw tool logs
  const execOpts = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] };

  try {
    try {
      const output = execSync(`lsof -i :${port} -n -P`, execOpts);
      return parseLsofOutput(output);
    } catch {
      if (PLATFORM === 'linux') {
        const output = execSync('netstat -anp', execOpts);
        return parseNetstatOutput(output, port);
      }
      return [];
    }
  } catch {
    return [];
  }
}

/**
 * Parse lsof output
 */
function parseLsofOutput(output) {
  const lines = output.trim().split('\n').slice(1);
  const processes = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const pid = parseInt(parts[1], 10);
      const command = parts[0];

      if (!isNaN(pid) && pid > 0) {
        if (!processes.find((p) => p.pid === pid)) {
          processes.push({ pid, command });
        }
      }
    }
  }

  return processes;
}

/**
 * Parse netstat output for a specific port
 */
function parseNetstatOutput(output, port) {
  const lines = output.trim().split('\n').slice(1);
  const processes = [];

  for (const line of lines) {
    const parts = line.split(/\s+/).filter((p) => p);
    if (parts.length >= 7) {
      const state = parts[5];
      const pidField = parts[6];
      const match = pidField.match(/^(\d+)\//);

      if (match && state === 'LISTEN') {
        const pid = parseInt(match[1], 10);
        const addr = parts[3];
        const addrParts = addr.split(':');
        const addrPort = addrParts[addrParts.length - 1];

        if (parseInt(addrPort, 10) === port && !isNaN(pid) && pid > 0) {
          let command = 'unknown';
          try {
            const psOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
            command = psOutput.trim();
          } catch {
            // ignore
          }

          if (!processes.find((p) => p.pid === pid)) {
            processes.push({ pid, command });
          }
        }
      }
    }
  }

  return processes;
}

/**
 * Get processes on Windows using netstat and tasklist
 */
async function getProcessesWindows(port) {
  try {
    const netstatOutput = execSync('netstat -ano', { encoding: 'utf8' });
    const pids = new Set();

    const lines = netstatOutput.trim().split('\n').slice(4);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5) {
        const state = parts[3];
        const pidStr = parts[4];
        const localAddr = parts[1];
        const addrParts = localAddr.split(':');
        const addrPort = parseInt(addrParts[addrParts.length - 1], 10);

        if (state === 'LISTENING' && addrPort === port) {
          const pid = parseInt(pidStr, 10);
          if (!isNaN(pid) && pid > 0) {
            pids.add(pid);
          }
        }
      }
    }

    const processes = [];
    for (const pid of pids) {
      let command = 'unknown';
      try {
        const tasklistOutput = execSync(`tasklist /FI "PID eq ${pid}"`, {
          encoding: 'utf8',
        });
        const taskLines = tasklistOutput.trim().split('\n');
        if (taskLines.length > 1) {
          const taskLine = taskLines[1].split(/\s+/)[0];
          command = taskLine;
        }
      } catch {
        // ignore
      }

      processes.push({ pid, command });
    }

    return processes;
  } catch (error) {
    console.error(colors.red(`Failed to get processes on port ${port}: ${error.message}`));
    return [];
  }
}

/**
 * Kill a process
 */
async function killProcess(pid, command) {
  try {
    if (PLATFORM === 'win32') {
      execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' });
    } else {
      try {
        kill(pid, 'SIGKILL');
      } catch {
        execSync(`kill -9 ${pid}`);
      }
    }
    console.log(colors.green(`✓ Killed process ${pid} (${command})`));
  } catch (error) {
    console.error(colors.red(`✗ Failed to kill process ${pid}: ${error.message}`));
  }
}

/**
 * Prompt user for confirmation
 */
function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: stdin,
      output: stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const response = answer.trim().toLowerCase();
      resolve(response === '' || response === 'y' || response === 'yes');
    });
  });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((error) => {
    console.error(colors.red(`Error: ${error.message}`));
    process.exit(1);
  });
}

export { parsePorts };
