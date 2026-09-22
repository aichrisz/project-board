import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import { APP_VERSION } from './version';

const require = createRequire(import.meta.url);

const packageJson = require('../package.json') as { version: string };
const packageLock = require('../package-lock.json') as {
  version: string;
  packages: { '': { version: string } };
};

describe('application version', () => {
  it('keeps runtime and package metadata synchronized', () => {
    assert.equal(APP_VERSION, '0.13.0');
    assert.equal(packageJson.version, APP_VERSION);
    assert.equal(packageLock.version, APP_VERSION);
    assert.equal(packageLock.packages[''].version, APP_VERSION);
  });
});
