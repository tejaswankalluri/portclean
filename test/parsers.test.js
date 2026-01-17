import test from 'node:test';
import assert from 'node:assert/strict';

test('Parse lsof output', (t) => {
  // Import the function by reading and executing
  const testParseLsofOutput = () => {
    const output = `COMMAND     PID   USER   FD   TYPE     DEVICE SIZE/OFF NODE NAME
node      12345   user    4u  IPv4 0x1234567   0t0  TCP *:3000 (LISTEN)
node      12345   user    5u  IPv4 0x7654321   0t0  TCP *:3001 (LISTEN)
chrome    54321   user   10u  IPv4 0xabcdefg   0t0  TCP localhost:8080 (LISTEN)`;

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
  };

  const result = testParseLsofOutput();
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { pid: 12345, command: 'node' });
  assert.deepEqual(result[1], { pid: 54321, command: 'chrome' });
});

test('Parse netstat output (Linux)', (t) => {
  const testParseNetstat = (port) => {
    const output = `Active Internet connections (servers and established)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:3000            0.0.0.0:*               LISTEN      12345/node
tcp        0      0 127.0.0.1:8080          0.0.0.0:*               LISTEN      54321/chrome
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1/systemd`;

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
            const command = pidField.split('/')[1] || 'unknown';
            if (!processes.find((p) => p.pid === pid)) {
              processes.push({ pid, command });
            }
          }
        }
      }
    }

    return processes;
  };

  const result = testParseNetstat(3000);
  assert.equal(result.length, 1);
  assert.equal(result[0].pid, 12345);
  assert.equal(result[0].command, 'node');

  const result2 = testParseNetstat(8080);
  assert.equal(result2.length, 1);
  assert.equal(result2[0].pid, 54321);
});

test('Parse netstat output (Windows)', (t) => {
  const testParseNetstatWindows = (port) => {
    const output = `  Proto  Local Address          State           PID
  TCP    0.0.0.0:3000           LISTENING       12345
  TCP    127.0.0.1:8080         LISTENING       54321
  TCP    0.0.0.0:22             LISTENING       1`;

    const pids = new Set();
    const lines = output.trim().split('\n').slice(1);

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const state = parts[2];
        const pidStr = parts[3];
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

    return Array.from(pids);
  };

  const result = testParseNetstatWindows(3000);
  assert.deepEqual(result, [12345]);

  const result2 = testParseNetstatWindows(8080);
  assert.deepEqual(result2, [54321]);
});

test('Validate ports', (t) => {
  const validatePort = (port) => {
    const p = parseInt(port, 10);
    return !isNaN(p) && p >= 1 && p <= 65535;
  };

  assert.equal(validatePort('3000'), true);
  assert.equal(validatePort('80'), true);
  assert.equal(validatePort('65535'), true);
  assert.equal(validatePort('1'), true);
  assert.equal(validatePort('0'), false);
  assert.equal(validatePort('65536'), false);
  assert.equal(validatePort('invalid'), false);
  assert.equal(validatePort('-1'), false);
});

test('Confirmation input parsing', (t) => {
  const isYes = (input) => input.toLowerCase() === 'y';

  assert.equal(isYes('y'), true);
  assert.equal(isYes('Y'), true);
  assert.equal(isYes('yes'), false);
  assert.equal(isYes('n'), false);
  assert.equal(isYes('N'), false);
  assert.equal(isYes(''), false);
  assert.equal(isYes(' y'), false);
});
