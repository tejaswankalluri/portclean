# portclean

A fast, cross-platform CLI tool to kill processes using specific ports. Supports macOS, Linux, and Windows.

## Installation

```bash
npm install -g portclean
```

## Usage

```
portclean [ports...] [options]

Arguments:
  ports         Port number(s) or ranges to target (e.g. 3000 or 3000-3010)

Options:
  --force, -f   Skip confirmation prompt
  --all, -a     Kill all processes using each port
  --help, -h    Show help message
  --version, -v Show version number
```

## Examples

### Kill a single port with confirmation

```bash
$ portclean 3000
Processes on port 3000:
  1. PID 12345 (node)
Process 12345 (node) is using port 3000. Kill it? (y/N) y
✓ Killed process 12345 (node)
```

### Kill multiple ports

```bash
$ portclean 3000 8080 9000
Processes on port 3000:
  1. PID 12345 (node)
Process 12345 (node) is using port 3000. Kill it? (y/N) y
✓ Killed process 12345 (node)

Processes on port 8080:
  1. PID 54321 (python)
Process 54321 (python) is using port 8080. Kill it? (y/N) y
✓ Killed process 54321 (python)

Processes on port 9000:
  1. PID 11111 (go)
Process 11111 (go) is using port 9000. Kill it? (y/N) y
✓ Killed process 11111 (go)
```

### Kill without confirmation

```bash
$ portclean 3000 --force
Processes on port 3000:
  1. PID 12345 (node)
✓ Killed process 12345 (node)
```

### Kill a port range

```bash
$ portclean 3000-3010 --force
Processes on port 3000:
  1. PID 12345 (node)
✓ Killed process 12345 (node)

...

Processes on port 3010:
  1. PID 12399 (go)
✓ Killed process 12399 (go)
```

### Kill all processes using a port

When multiple processes are using the same port:

```bash
$ portclean 3000 --all
Processes on port 3000:
  1. PID 12345 (node)
  2. PID 12346 (node)
  3. PID 12347 (node)
Kill all 3 process(es) on port 3000? (y/N) y
✓ Killed process 12345 (node)
✓ Killed process 12346 (node)
✓ Killed process 12347 (node)
```

### Kill all processes without confirmation

```bash
$ portclean 3000 8080 9000 --all --force
Processes on port 3000:
  1. PID 12345 (node)
  2. PID 12346 (node)
✓ Killed process 12345 (node)
✓ Killed process 12346 (node)

Processes on port 8080:
  1. PID 54321 (python)
✓ Killed process 54321 (python)

Processes on port 9000:
  1. PID 11111 (go)
✓ Killed process 11111 (go)
```

### Kill processes on ports without --all (prompts per process)

```bash
$ portclean 3000-3002
Processes on port 3000:
  1. PID 12345 (node)
Process 12345 (node) is using port 3000. Kill it? (y/N) y
✓ Killed process 12345 (node)

Processes on port 3001:
  1. PID 12346 (node)
Process 12346 (node) is using port 3001. Kill it? (y/N) n

Processes on port 3002:
  1. PID 12347 (node)
Process 12347 (node) is using port 3002. Kill it? (y/N) y
✓ Killed process 12347 (node)
```

## How it works

### macOS/Linux

1. **Primary method**: Uses `lsof -i :<port>` to find processes
2. **Fallback (Linux only)**: If `lsof` is not available, uses `netstat -anp` and parses the output (stderr suppressed)
3. **macOS fallback**: macOS `netstat` lacks PID data, so we skip it and return no processes instead of printing errors
4. **Process names**: Extracted from the command output or via `ps` command

### Windows

1. Uses `netstat -ano` to list all listening ports and their PIDs
2. Uses `tasklist /FI "PID eq <pid>"` to get the process image name
3. Sends SIGKILL equivalent via `taskkill /PID <pid> /F`

## Exit Codes

- `0`: Successfully handled (killed or no process found)
- `1`: Invalid arguments, unsupported platform, or system errors

## Development

### Running tests

```bash
npm test
```

### Smoke test

```bash
npm run smoke
```

## Requirements

- Node.js >= 14
- macOS, Linux, or Windows
- No additional system dependencies required

## License

MIT
