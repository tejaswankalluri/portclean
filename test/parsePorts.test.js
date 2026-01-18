import { test } from 'node:test';
import assert from 'node:assert';
import { parsePorts } from '../cli.js';

test('parsePorts - Single valid ports', () => {
  const result = parsePorts(['3000']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Multiple valid ports', () => {
  const result = parsePorts(['3000', '8080', '9000']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 8080, 9000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Single valid range', () => {
  const result = parsePorts(['3000-3005']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 3003, 3004, 3005]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Multiple ranges', () => {
  const result = parsePorts(['3000-3002', '5000-5002']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 5000, 5001, 5002]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Overlapping ranges deduplicate', () => {
  const result = parsePorts(['3000-3005', '3003-3008']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Mixed ports and ranges', () => {
  const result = parsePorts(['3000', '3001', '8000-8002', '9000']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 8000, 8001, 8002, 9000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Duplicate ports deduplicate', () => {
  const result = parsePorts(['3000', '3000', '3000']);
  assert.deepStrictEqual(result.ports, [3000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Port at lower bound (1)', () => {
  const result = parsePorts(['1']);
  assert.deepStrictEqual(result.ports, [1]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Port at upper bound (65535)', () => {
  const result = parsePorts(['65535']);
  assert.deepStrictEqual(result.ports, [65535]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Invalid port below 1', () => {
  const result = parsePorts(['0']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Invalid port'));
  assert(result.errors[0].includes('0'));
});

test('parsePorts - Invalid port above 65535', () => {
  const result = parsePorts(['70000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port 70000'));
});

test('parsePorts - Non-numeric port', () => {
  const result = parsePorts(['abc']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Invalid port'));
  assert(result.errors[0].includes('abc'));
});

test('parsePorts - Range with start > end', () => {
  const result = parsePorts(['5000-3000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Range with invalid start (out of bounds)', () => {
  const result = parsePorts(['0-1000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Range with invalid end (out of bounds)', () => {
  const result = parsePorts(['60000-70000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Range with non-numeric start', () => {
  const result = parsePorts(['abc-3000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Range with non-numeric end', () => {
  const result = parsePorts(['3000-xyz']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Mixed valid and invalid single ports', () => {
  const result = parsePorts(['3000', '70000', '8080']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 8080]);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port 70000'));
});

test('parsePorts - Mixed valid and invalid ranges', () => {
  const result = parsePorts(['3000-3002', '5000-4000', '8000-8001']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 8000, 8001]);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Error: Invalid port range'));
});

test('parsePorts - Multiple errors from multiple invalid inputs', () => {
  const result = parsePorts(['70000', 'abc', '5000-4000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 3);
  assert(result.errors.some(e => e.includes('70000')));
  assert(result.errors.some(e => e.includes('abc')));
  assert(result.errors.some(e => e.includes('Invalid port range')));
});

test('parsePorts - Complex mix of valid and invalid', () => {
  const result = parsePorts(['3000', '3001', '70000', '5000-5005', '8080', 'invalid', '9000-8000']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 5000, 5001, 5002, 5003, 5004, 5005, 8080]);
  assert.deepStrictEqual(result.errors.length, 3);
  assert(result.errors.some(e => e.includes('70000')));
  assert(result.errors.some(e => e.includes('invalid')));
  assert(result.errors.some(e => e.includes('9000-8000')));
});

test('parsePorts - Ports in range result as integers', () => {
  const result = parsePorts(['3000-3003']);
  result.ports.forEach(port => {
    assert.strictEqual(typeof port, 'number');
    assert(Number.isInteger(port));
  });
});

test('parsePorts - Single ports result as integers', () => {
  const result = parsePorts(['3000', '8080', '9000']);
  result.ports.forEach(port => {
    assert.strictEqual(typeof port, 'number');
    assert(Number.isInteger(port));
  });
});

test('parsePorts - Large range (boundary test)', () => {
  const result = parsePorts(['1-100']);
  assert.deepStrictEqual(result.ports.length, 100);
  assert.deepStrictEqual(result.errors, []);
  assert.deepStrictEqual(result.ports[0], 1);
  assert.deepStrictEqual(result.ports[99], 100);
});

test('parsePorts - Empty input array', () => {
  const result = parsePorts([]);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Negative port number', () => {
  const result = parsePorts(['-3000']);
  assert.deepStrictEqual(result.ports, []);
  assert.deepStrictEqual(result.errors.length, 1);
  assert(result.errors[0].includes('Invalid port'));
});

test('parsePorts - Floating point port (parsed as integer)', () => {
  const result = parsePorts(['3000.5']);
  // parseInt will parse "3000.5" as 3000, so this is valid
  assert.deepStrictEqual(result.ports, [3000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Port with leading zeros', () => {
  const result = parsePorts(['03000']);
  assert.deepStrictEqual(result.ports, [3000]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Range with leading zeros', () => {
  const result = parsePorts(['03000-03005']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 3003, 3004, 3005]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Deduplication across mixed inputs', () => {
  const result = parsePorts(['3000', '3000-3005', '3003', '3005']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 3003, 3004, 3005]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Range boundary at 65535', () => {
  const result = parsePorts(['65533-65535']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [65533, 65534, 65535]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Range starting at 1', () => {
  const result = parsePorts(['1-5']);
  assert.deepStrictEqual(result.ports, [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Whitespace handling (single space in range)', () => {
  // parseInt tolerates whitespace, so this range is accepted
  const result = parsePorts(['3000 - 3005']);
  assert.deepStrictEqual(result.ports.sort((a, b) => a - b), [3000, 3001, 3002, 3003, 3004, 3005]);
  assert.deepStrictEqual(result.errors, []);
});

test('parsePorts - Error messages include port/range details', () => {
  const result = parsePorts(['99999']);
  assert(result.errors.length === 1);
  assert(result.errors[0].includes('Error: Invalid port'));
  assert(result.errors[0].includes('99999'));
});
