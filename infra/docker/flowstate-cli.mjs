#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const [command, ...args] = process.argv.slice(2);
if (command === 'status' || command === 'diff') {
  const result = spawnSync(
    '/usr/bin/git',
    [command, ...(command === 'status' ? ['--short'] : []), ...args],
    { cwd: '/workspace', stdio: 'inherit' },
  );
  process.exitCode = result.status ?? 1;
} else if (command === 'push') {
  const title = args.join(' ').trim();
  if (!title || title.length > 150 || /[\x00-\x1f]/.test(title)) {
    console.error('Usage: flowstate push "Short commit message"');
    process.exitCode = 1;
  } else {
    writeFileSync('/tmp/flowstate-publish.json', JSON.stringify({ id: randomUUID(), title }), {
      mode: 0o600,
    });
    console.log(
      'Publish review requested in FLOWSTATE. Review and import terminal edits, then confirm the branch and pull request in the browser. Nothing has been pushed yet.',
    );
  }
} else {
  console.log(
    'FLOWSTATE terminal commands:\n  flowstate status\n  flowstate diff\n  flowstate push "Short commit message"\n\nPublishing requires confirmation in the browser. GitHub credentials remain outside this container.',
  );
}
