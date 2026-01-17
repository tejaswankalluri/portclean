#!/usr/bin/env node

import { execSync, exec } from 'child_process';
import { kill } from 'process';
import { stdin, stdout, stderr } from 'process';
import parseArgs from 'mri';
import colors from 'picocolors';
import * as readline from 'readline';

const VERSION = '1.0.0';
const PLATFORM = process.platform;

// Parse CLI arguments
const args = parseArgs(process.argv.slice(2), {
  alias: {
    h: 'help',
    v: 'version',
    f: 'force',
    a: 'all',
  },
});

// Handle help flag
if (args.help) {
  console.log(`
${colors.bold('portclean')} - Kill processes using specific ports

${colors.bold('Usage:')}
  portclean [ports...] [options]

${colors.bold('Arguments:')}
  ports         Port number(s) to target

${colors.bold('Options:')}
  --force, -f   Skip confirmation prompt
  --all, -a     Kill all processes using each port
  --help, -h    Show this help message
  --version, -v Show version number

${colors.bold('Examples:')}
  portclean 3000                    Kill process on port 3000
  portclean 3000 8080               Kill processes on ports 3000 and 8080
  portclean 3000 --force            Kill port 3000 without confirmation
  portclean 3000 --all              Kill all processes using port 3000
  portclean 3000 8080 --force --all Kill all processes on both ports without confirmation
`);
  process.exit(0);
}

// Handle version flag
if (args.version) {
  console.log(`portkill v${VERSION}`);
  process.exit(0);
}

// Get ports from positional arguments
const ports = args._;

// Validate ports
if (ports.length === 0) {
  console.error(colors.red('Error: No ports specified'));
  process.exit(1);
}

const validPorts = ports.filter((p) => {
  const port = parseInt(p, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(colors.red(`Error: Invalid port ${p}`));
    return false;
  }
  return true;
});

if (validPorts.length === 0) {
  process.exit(1);
}

// Main execution
(async () => {
  try {
    for (const port of validPorts) {
      await handlePort(parseInt(port, 10));
    }
    process.exit(0);
  } catch (error) {
    console.error(colors.red(`Error: ${error.message}`));
    process.exit(1);
  }
})();

/**
 * Handle killing processes on a specific port
 */
async function handlePort(port) {
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
        // Kill without confirmation
        for (const proc of processes) {
          await killProcess(proc.pid, proc.command);
        }
      } else if (args.all) {
        // --all without --force: single confirmation
        const confirmed = await prompt(
          `Kill all ${processes.length} process(es) on port ${port}? (y/N) `
        );
        if (confirmed) {
          for (const proc of processes) {
            await killProcess(proc.pid, proc.command);
          }
        }
      }
    } else {
      // Without --all: prompt per process
      for (const proc of processes) {
        const confirmed = await prompt(
          `Process ${proc.pid} (${proc.command}) is using port ${port}. Kill it? (y/N) `
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
  try {
    // Try lsof first
    try {
      const output = execSync(`lsof -i :${port} -n -P`, { encoding: 'utf8' });
      return parseLsofOutput(output);
    } catch {
      // Fallback to netstat
      const output = execSync('netstat -anp', { encoding: 'utf8' });
      return parseNetstatOutput(output, port);
    }
  } catch (error) {
    console.error(colors.red(`Failed to get processes on port ${port}: ${error.message}`));
    return [];
  }
}

/**
 * Parse lsof output
 */
function parseLsofOutput(output) {
  const lines = output.trim().split('\n').slice(1); // Skip header
  const processes = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      const pid = parseInt(parts[1], 10);
      const command = parts[0];

      if (!isNaN(pid) && pid > 0) {
        // Check if already added
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
  const lines = output.trim().split('\n').slice(1); // Skip header
  const processes = [];

  for (const line of lines) {
    const parts = line.split(/\s+/).filter((p) => p);
    if (parts.length >= 7) {
      const state = parts[5];
      const pidField = parts[6];
      const match = pidField.match(/^(\d+)\//);

      if (match && state === 'LISTEN') {
        const pid = parseInt(match[1], 10);
        const proto = parts[0];
        const addr = parts[3];
        const addrParts = addr.split(':');
        const addrPort = addrParts[addrParts.length - 1];

        if (parseInt(addrPort, 10) === port && !isNaN(pid) && pid > 0) {
          // Get command name
          let command = 'unknown';
          try {
            const psOutput = execSync(`ps -p ${pid} -o comm=`, { encoding: 'utf8' });
            command = psOutput.trim();
          } catch {
            // Use default
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

    const lines = netstatOutput.trim().split('\n').slice(4); // Skip header
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
        // Use default
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
      // Try using process.kill first
      try {
        kill(pid, 'SIGKILL');
      } catch {
        // Fallback to shell command
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
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
