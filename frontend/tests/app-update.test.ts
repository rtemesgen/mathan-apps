import assert from 'node:assert/strict';
import { isNewerVersion } from '../src/hooks/useAppUpdate';

assert.equal(isNewerVersion('1.5.1', '1.5.1'), false, 'an APK must not prompt to update to its own version');
assert.equal(isNewerVersion('v1.5.1', '1.5.1'), false);
assert.equal(isNewerVersion('1.5.2', '1.5.1'), true);
assert.equal(isNewerVersion('1.4.9', '1.5.1'), false);
console.log('App update version tests passed.');
