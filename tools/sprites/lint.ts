import { lintSprite } from '../../src/core/spritelint';
import { loadSpriteDefs } from './lib';

/** Validate and lint every sprite definition. Exits non-zero on any error or malformed file. */
let errors = 0;
let warnings = 0;
try {
  for (const { def } of loadSpriteDefs()) {
    const issues = lintSprite(def);
    for (const issue of issues) {
      console.log(`${issue.severity === 'error' ? 'ERROR  ' : 'warning'} ${def.id}: ${issue.message}`);
    }
    errors += issues.filter((i) => i.severity === 'error').length;
    warnings += issues.length - issues.filter((i) => i.severity === 'error').length;
  }
} catch (e) {
  console.error(`ERROR   ${(e as Error).message}`);
  process.exit(1);
}
console.log(`Sprite lint: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
