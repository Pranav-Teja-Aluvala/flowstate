// Test-process-only transport. Never imported by the application or a normal startup command.
const originalFetch = globalThis.fetch;
const base = '/repos/flowstate-fixture/repo';
const commit = 'a'.repeat(40);
const source = 'export const version = 1;\n';
const repository = {
  id: 12345,
  name: 'repo',
  full_name: 'flowstate-fixture/repo',
  owner: { login: 'flowstate-fixture' },
  default_branch: 'main',
  private: true,
  permissions: { push: true },
  html_url: 'https://github.com/flowstate-fixture/repo',
};
globalThis.fetch = async (input, init) => {
  const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (!raw.startsWith('https://api.github.com/')) return originalFetch(input, init);
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined),
  );
  const url = new URL(raw);
  const publicBase = '/repos/flowstate-fixture/public-repo';
  const publicMode = url.pathname === publicBase || url.pathname.startsWith(publicBase + '/');
  const path = publicMode ? url.pathname.replace(publicBase, base) : url.pathname;
  const method = init?.method || 'GET';
  if (publicMode) {
    if (headers.has('authorization') || method !== 'GET')
      throw new Error('Public fixtures forbid credentials and remote writes.');
  } else if (!headers.get('authorization')?.startsWith('Bearer flowstate-fixture-'))
    throw new Error('Only artificial test credentials are accepted by the private GitHub fixture.');
  if (!path.startsWith(base)) throw new Error('Unexpected GitHub fixture endpoint.');
  if (method === 'GET') {
    if (path === base)
      return Response.json(
        publicMode
          ? {
              ...repository,
              id: 12346,
              name: 'public-repo',
              full_name: 'flowstate-fixture/public-repo',
              private: false,
              permissions: undefined,
              html_url: 'https://github.com/flowstate-fixture/public-repo',
            }
          : repository,
      );
    if (path.endsWith('/branches')) return Response.json([{ name: 'main' }]);
    if (path.endsWith('/commits'))
      return Response.json([
        {
          sha: commit,
          html_url: 'https://github.com/flowstate-fixture/repo/commit/test',
          commit: { message: 'Initial test source', tree: { sha: 'root' } },
        },
      ]);
    if (path.endsWith('/pulls')) return Response.json([]);
    if (path.endsWith('/commits/main'))
      return Response.json({ sha: commit, commit: { tree: { sha: 'root' } } });
    if (path.endsWith(`/git/commits/${commit}`)) return Response.json({ tree: { sha: 'root' } });
    if (path.endsWith('/contents/'))
      return Response.json([{ name: 'src', path: 'src', type: 'dir', sha: 'src', size: 0 }]);
    if (path.endsWith('/contents/src'))
      return Response.json([
        { name: 'index.ts', path: 'src/index.ts', type: 'file', sha: 'blob', size: source.length },
      ]);
    if (path.endsWith('/git/trees/root'))
      return Response.json({
        truncated: false,
        tree: url.searchParams.has('recursive')
          ? [
              {
                path: 'src/index.ts',
                type: 'blob',
                mode: '100644',
                sha: 'blob',
                size: source.length,
              },
            ]
          : [{ path: 'src', type: 'tree', mode: '040000', sha: 'src' }],
      });
    if (path.endsWith('/git/trees/src'))
      return Response.json({
        tree: [
          { path: 'index.ts', type: 'blob', mode: '100644', sha: 'blob', size: source.length },
        ],
      });
    if (path.endsWith('/git/blobs/blob'))
      return Response.json({ encoding: 'base64', content: Buffer.from(source).toString('base64') });
  }
  if (method === 'POST') {
    const body = JSON.parse(init.body);
    if (path.endsWith('/git/trees')) {
      if (
        body.base_tree !== 'root' ||
        !body.tree.some(
          (file) => file.path === 'src/index.ts' && file.content.includes('owner edit'),
        )
      )
        throw new Error('Expected saved code changes against the original tree.');
      return Response.json({ sha: 'updated-tree' });
    }
    if (path.endsWith('/git/commits')) {
      if (body.parents[0] !== commit) throw new Error('Wrong commit parent.');
      return Response.json({ sha: 'updated-commit' });
    }
    if (path.endsWith('/git/refs')) {
      if (!body.ref.startsWith('refs/heads/flowstate/'))
        throw new Error('Tests forbid writing the base branch.');
      return Response.json({ ref: body.ref });
    }
    if (path.endsWith('/pulls')) {
      if (!body.head.startsWith('flowstate/') || body.base !== 'main')
        throw new Error('Unexpected pull request target.');
      return Response.json({ html_url: 'https://github.com/flowstate-fixture/repo/pull/1' });
    }
  }
  throw new Error('Unexpected GitHub fixture operation.');
};
