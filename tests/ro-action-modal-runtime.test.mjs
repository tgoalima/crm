import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

// Execute the real browser scripts, including the domain destructuring in app.js.
// Only React/DOM infrastructure is replaced: this is a mount-time smoke test,
// not a browser, focus-management, or API-persistence test.
const domainSource = readFileSync(new URL('../ros-ui-domain.js', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const { code: appCode } = transformSync(appSource, {
  loader: 'jsx',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  sourcefile: 'app.js',
});
const scripts = [
  { filename: 'app.js', code: appCode },
  { filename: 'dist/app.js', code: readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8') },
];

// 01:30 UTC is still September 12 in Sao Paulo, independently of the host TZ.
const fixedInstant = Date.parse('2026-09-13T01:30:00.000Z');
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length ? args : [fixedInstant]));
  }
  static now() { return fixedInstant; }
}

function initializeModal(acao, script) {
  const effects = [];
  const cleanups = [];
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    Fragment: Symbol('Fragment'),
    memo: component => component,
    useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: value => ({ current: value }),
    useCallback: callback => callback,
    useMemo: factory => factory(),
    useEffect: effect => { effects.push(effect); },
  };
  const body = {};
  const context = vm.createContext({
    React,
    ReactDOM: {
      // Do not mount the entire CRM or trigger its network effects.
      createRoot: () => ({ render() {} }),
      createPortal: (children, container) => ({ children, container }),
    },
    document: { body, getElementById: () => ({}) },
    localStorage: { getItem: () => null },
    Date: FixedDate,
    // Real useModalLayer runs, but there are no mounted DOM refs to focus.
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    fetch() { throw new Error('A inicialização do modal não deve consultar a rede.'); },
  });
  context.window = context;
  vm.runInContext(domainSource, context, { filename: 'ros-ui-domain.js' });
  vm.runInContext(script.code, context, { filename: script.filename });

  const rendered = context.RoActionModal({
    aberto: true,
    acao,
    ro: {
      id: 'ro-runtime-test',
      versao: 2,
      numero_ro: 'RO-TESTE-001',
      data_vencimento: '2026-12-01',
      fabricantes_ro: { nome: 'Fabricante de teste', prazo_inicial_sugerido_dias: 90 },
    },
    cicloPendente: { ciclo: 2 },
    onClose() {},
    onSuccess() {},
  });

  // Mount effects also reset date fields and previously hit the same missing name.
  try {
    for (const effect of effects) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
  return rendered.container === body ? rendered.children : rendered;
}

function elements(tree) {
  if (tree === null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return [tree, ...elements(tree.props?.children)];
}

const cases = [
  { acao: 'enviar', datas: ['2026-09-12'] },
  { acao: 'aprovar', datas: ['2026-09-12', '2026-12-01'] },
  { acao: 'solicitar_renovacao', datas: ['2026-09-12'] },
  { acao: 'responder_renovacao', datas: ['2026-09-12', ''] },
  { acao: 'substituir', datas: [] },
  { acao: 'encerrar', datas: ['2026-09-12'] },
];

for (const script of scripts) {
  for (const { acao, datas } of cases) {
    test(`${script.filename}: RoActionModal inicializa ${acao} com datas civis de São Paulo sem ReferenceError`, () => {
      const tree = initializeModal(acao, script);
      const nodes = elements(tree);
      assert.equal(tree.props.role, 'dialog');
      assert.equal(tree.props['aria-modal'], 'true');
      assert.equal(nodes.filter(node => node.type === 'form').length, 1);
      assert.equal(nodes.filter(node => node.type === 'button' && node.props.type === 'submit').length, 1);
      assert.deepEqual(
        nodes.filter(node => node.type === 'input' && node.props.type === 'date').map(node => node.props.value),
        datas,
        'datas de operação usam hoje em SP; vencimentos preservam valores existentes ou ficam vazios',
      );
    });
  }
}
