import { execSync } from 'child_process';
import assert from 'assert';

function testCredentialValidation() {
  console.log('Testing ADMIN_PASSWORD validation rules...');

  // Test 1: Missing password refuses to boot
  try {
    execSync('ADMIN_PASSWORD="" npx tsx -e "import { env } from \'./server/src/config/env\'; console.log(env.PORT);"', {
      stdio: 'pipe',
    });
    assert.fail('Expected server to refuse to boot with empty ADMIN_PASSWORD');
  } catch (err: any) {
    const output = (err.stderr || err.stdout || '').toString();
    assert(output.includes('ADMIN_PASSWORD environment variable is missing or shorter than 12 characters'), 'Should output fatal error');
    assert(!output.includes('admin123'), 'Must not log password');
    console.log('✓ Refuses to start when ADMIN_PASSWORD is empty');
  }

  // Test 2: Password shorter than 12 chars refuses to boot
  try {
    execSync('ADMIN_PASSWORD="shortpass" npx tsx -e "import { env } from \'./server/src/config/env\'; console.log(env.PORT);"', {
      stdio: 'pipe',
    });
    assert.fail('Expected server to refuse to boot with short ADMIN_PASSWORD');
  } catch (err: any) {
    const output = (err.stderr || err.stdout || '').toString();
    assert(output.includes('ADMIN_PASSWORD environment variable is missing or shorter than 12 characters'), 'Should output fatal error');
    assert(!output.includes('shortpass'), 'Must never log password');
    console.log('✓ Refuses to start when ADMIN_PASSWORD is < 12 characters');
  }

  // Test 3: Valid 12+ char password boots successfully
  const validOutput = execSync('ADMIN_PASSWORD="SecureAdminPass2026_ODS!" npx tsx -e "import { env } from \'./server/src/config/env\'; console.log(\'BOOT_OK:\' + env.PORT);"', {
    stdio: 'pipe',
  }).toString();
  assert(validOutput.includes('BOOT_OK:5001'));
  assert(!validOutput.includes('SecureAdminPass2026_ODS!'), 'Must never log the password');
  console.log('✓ Successfully boots when ADMIN_PASSWORD is >= 12 characters without logging it');

  console.log('All credential validation tests passed!');
}

testCredentialValidation();

