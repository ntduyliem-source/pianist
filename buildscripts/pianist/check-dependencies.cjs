// Static architectural boundaries; uses the already pinned Prettier TS parser.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '../..');
const appRequire = createRequire(path.join(ROOT, 'apps/pianist-web/package.json'));
const parser = appRequire('prettier/plugins/typescript').parsers.typescript;
const allowed = {
  'score-contracts': [],
  'practice-engine-v2': ['score-contracts'],
  'practice-worker-v2': ['practice-engine-v2'],
  'engine-bridge': ['score-contracts'],
  'exercise-renderer': ['score-contracts'],
  'score-formats': ['score-contracts', 'engine-bridge'],
  // Historical lab contracts remain maintained, but are not an app dependency.
  'exercise-generator': ['score-contracts', 'practice-engine-v2'],
};
const pure = new Set(['score-contracts', 'practice-engine-v2']);
const ioGlobals = new Set([
  'window',
  'document',
  'fetch',
  'Worker',
  'AudioContext',
  'localStorage',
  'indexedDB',
  'XMLHttpRequest',
]);
const slash = (value) => value.split(path.sep).join('/');
const packageOf = (value) => /^packages\/([^/]+)(?:\/|$)/.exec(value)?.[1];
const literal = (node) =>
  node?.type === 'Literal' && typeof node.value === 'string'
    ? node.value
    : node?.type === 'TemplateLiteral' && !node.expressions.length
      ? node.quasis[0].value.cooked
      : undefined;

function inspectSource(filename, source, root = ROOT) {
  const relative = slash(path.relative(root, filename)),
    owner = packageOf(relative);
  const app = relative.startsWith('apps/pianist-web/src/');
  const failures = [],
    edges = [];
  const fail = (node, message) =>
    failures.push(`${relative}:${node.loc?.start.line ?? 1}: ${message}`);
  let ast;
  try {
    ast = parser.parse(source, { filepath: filename });
  } catch (error) {
    return { failures: [`${relative}: cannot parse source: ${error.message}`], edges };
  }
  if (owner && !Object.hasOwn(allowed, owner))
    fail(ast, `Unclassified package ${owner}; declare its dependency direction.`);

  function dependency(node, specifier) {
    if (specifier === undefined) return; // Runtime native/remote module URLs are not static imports.
    if (!specifier.startsWith('.')) {
      if (owner && (pure.has(owner) || /^react(?:-dom)?(?:\/|$)/.test(specifier)))
        fail(node, `${owner} cannot depend on external/UI module ${specifier}.`);
      return;
    }
    const target = slash(
      path.relative(root, path.resolve(path.dirname(filename), specifier.split('?')[0])),
    );
    const destination = packageOf(target);
    edges.push({ from: relative, to: target });
    if (owner && target.startsWith('apps/'))
      fail(node, 'Packages must not depend on an application.');
    if (destination && destination !== owner) {
      if (owner && !(allowed[owner] ?? []).includes(destination))
        fail(node, `${owner} cannot depend on ${destination}.`);
      if (app && destination === 'exercise-generator')
        fail(node, 'Historical exercise-generator contracts must not enter the live app.');
      if (
        target !== `packages/${destination}` &&
        !new RegExp(`^packages/${destination}/index(?:\\.(?:ts|js))?$`).test(target)
      )
        fail(node, `Use the public index of ${destination}, not ${specifier}.`);
    }
    if (owner && pure.has(owner) && !destination)
      fail(node, `${owner} must not import files outside the domain packages (${specifier}).`);
  }

  function visit(node, parent, key) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, parent, key);
      return;
    }
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type)
    )
      dependency(node, literal(node.source));
    if (node.type === 'TSImportType')
      dependency(node, literal(node.argument?.literal ?? node.argument ?? node.parameter));
    if (node.type === 'TSExternalModuleReference') dependency(node, literal(node.expression));
    if (node.type === 'CallExpression' && node.callee?.name === 'require')
      dependency(node, literal(node.arguments[0]));
    if (
      node.type === 'NewExpression' &&
      node.callee?.name === 'URL' &&
      node.arguments[1]?.object?.type === 'MetaProperty' &&
      node.arguments[1]?.property?.name === 'url'
    )
      dependency(node, literal(node.arguments[0]));
    const pattern =
      node.type === 'VariableDeclarator'
        ? node.id
        : node.type === 'AssignmentExpression'
          ? node.left
          : undefined;
    const binding =
      node.type === 'VariableDeclarator'
        ? node.init
        : node.type === 'AssignmentExpression'
          ? node.right
          : undefined;
    if (
      pure.has(owner) &&
      pattern?.type === 'ObjectPattern' &&
      binding?.type === 'Identifier' &&
      ['globalThis', 'self'].includes(binding.name)
    ) {
      for (const property of pattern.properties) {
        const name = property.computed
          ? literal(property.key)
          : (property.key?.name ?? literal(property.key));
        if (ioGlobals.has(name))
          fail(property, `${owner} must not bind browser/I/O global ${name}.`);
      }
    }
    if (pure.has(owner) && node.type === 'Identifier' && ioGlobals.has(node.name)) {
      const globalMember =
        parent?.type === 'MemberExpression' && ['globalThis', 'self'].includes(parent.object?.name);
      const propertyName =
        (parent?.type === 'MemberExpression' &&
          key === 'property' &&
          !parent.computed &&
          !globalMember) ||
        (parent?.type === 'Property' && key === 'key' && !parent.computed);
      if (!propertyName) fail(node, `${owner} must not use browser/I/O global ${node.name}.`);
    }
    if (
      pure.has(owner) &&
      node.type === 'MemberExpression' &&
      node.computed &&
      ['globalThis', 'self'].includes(node.object?.name) &&
      ioGlobals.has(literal(node.property))
    )
      fail(node, `${owner} must not use browser/I/O global ${literal(node.property)}.`);
    for (const [childKey, child] of Object.entries(node))
      if (!['loc', 'range', 'comments', 'tokens'].includes(childKey)) visit(child, node, childKey);
  }
  visit(ast);
  return { failures, edges };
}

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((item) => {
    const filename = path.join(directory, item.name);
    if (item.isDirectory())
      return ['node_modules', '.test-dist'].includes(item.name) ? [] : filesIn(filename);
    return /\.(?:tsx?|[cm]?js)$/.test(filename) && !filename.endsWith('.d.ts') ? [filename] : [];
  });
}

function check(root = ROOT) {
  const files = ['apps/pianist-web/src', 'packages'].flatMap((directory) =>
    filesIn(path.join(root, directory)),
  );
  const results = files.map((filename) =>
    inspectSource(filename, fs.readFileSync(filename, 'utf8'), root),
  );
  const failures = results.flatMap((result) => result.failures);
  return {
    files: files.length,
    dependencies: results.reduce((sum, result) => sum + result.edges.length, 0),
    failures,
  };
}

module.exports = { inspectSource, check };
if (require.main === module) {
  const report = check();
  if (report.failures.length) {
    console.error(report.failures.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      `Architectural boundaries verified: ${report.files} production modules, ${report.dependencies} static dependencies.`,
    );
}
