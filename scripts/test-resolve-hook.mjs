// Minimal resolve hook so node:test can load the app's extensionless
// relative TS imports (bundler-style) without adding a test framework.
import { registerHooks } from 'node:module';

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[a-zA-Z0-9]+$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        return nextResolve(specifier, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
