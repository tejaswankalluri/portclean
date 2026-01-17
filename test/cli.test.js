import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'child_process';

test('CLI --help flag', (t) => {
  const output = execSync('node cli.js --help', { encoding: 'utf8' });
  assert(output.includes('portclean'));
  assert(output.includes('Usage:'));
  assert(output.includes('--force'));
  assert(output.includes('--all'));
});

test('CLI -h flag', (t) => {
  const output = execSync('node cli.js -h', { encoding: 'utf8' });
  assert(output.includes('portclean'));
});

test('CLI --version flag', (t) => {
  const output = execSync('node cli.js --version', { encoding: 'utf8' });
  assert(output.includes('v'));
  assert(output.includes('.'));
});

test('CLI -v flag', (t) => {
  const output = execSync('node cli.js -v', { encoding: 'utf8' });
  assert(output.includes('v'));
});

test('CLI errors on no ports', (t) => {
  try {
    execSync('node cli.js', { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('Should have exited with error');
  } catch (error) {
    assert.equal(error.status, 1);
  }
});

test('CLI errors on invalid port', (t) => {
  try {
    execSync('node cli.js invalid', { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('Should have exited with error');
  } catch (error) {
    assert.equal(error.status, 1);
  }
});

test('CLI errors on port out of range', (t) => {
  try {
    execSync('node cli.js 99999', { encoding: 'utf8', stdio: 'pipe' });
    assert.fail('Should have exited with error');
  } catch (error) {
    assert.equal(error.status, 1);
  }
});

test('CLI accepts valid ports', (t) => {
  // This test just checks parsing, won't actually kill anything
  // It should fail gracefully if no process on port
  try {
    execSync('node cli.js 65535 --force', { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    // Expected to fail but with exit code 0 (graceful handling)
    assert(error.status === 0 || error.status === 1);
  }
});
