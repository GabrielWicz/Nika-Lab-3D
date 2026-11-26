import { calcular, centavos, concluir, dre, hoje, saldo } from './modelo.mjs';

const $ = selector => document.querySelector(selector);
const view = $('#conteudo');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = value => brl.format(value / 100);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[ch]);
const date = value => value?.split('-').reverse().join('/') || '—';
const input = (label, name, attrs = '') => '<label>' + label + '<input name="' + name + '" ' + attrs + '></label>';
const num = (label, name, attrs = '') => input(label, name, 'type="number" min="0" step=".01" ' + attrs);
const select = (label, name, options) => '<label>' + label + '<select name="' + name + '">' +
  options.map(([id, title]) => '<option value="' + esc(id) + '">' + esc(title) + '</option>').join('') + '</select></label>';
const records = list => list.map(item => [item.id, item.nome]);
const button = (label, attrs = '') => '<button class="primary" ' + attrs + '>' + label + '</button>';
const table = (columns, rows) => rows.length ? '<div class="table"><table><thead><tr>' +
  columns.map(label => '<th scope="col">' + label + '</th>').join('') +
  '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + cell + '</td>').join('') + '</tr>').join('') +
  '</tbody></table></div>' : '<p class="card">Nenhum registro.</p>';
const details = (title, id, fields) => '<details><summary>' + title + '</summary><form id="' + id + '">' +
  fields + button('Salvar') + '</form></details>';
const categories = { despesas: 'Despesa operacional', compras: 'Compra de insumos', equipamentos: 'Equipamentos' };
const pages = ['DRE', 'Produtos', 'Estoque', 'Calculadora', 'Orçamentos', 'Pedidos', 'Gastos'];
let page = 'DRE';
let snapshot;
let busy = false;
let inicio = hoje().slice(0, 7) + '-01';
let fim = hoje();

async function api(path, method = 'GET', data) {
  const res = await fetch('/api/' + path, {
    method, headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(data ?? {})
  });
  const result = await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error), { status: res.status });
  return result;
}

function message(value = '') {
  $('#mensagem').textContent = value;
  $('#mensagem').hidden = !value;
}

async function action(work, success) {
  if (busy) return;
  busy = true;
  message();
  try {
    await work();
    message(success);
  } catch (error) {
    if (error.status === 401 && snapshot) {
      snapshot = undefined;
      render();
    }
    if (error.status === 409) {
      const latest = await api('empresa').catch(() => null);
      if (latest) {
        snapshot = latest;
        render();
        message('Outra sessão salvou alterações. Os dados foram atualizados. Tente novamente.');
        return;
      }
    }
    message(error.message);
  } finally {
    busy = false;
  }
}

async function change(mutate, next = page) {
  const data = structuredClone(snapshot.data);
  mutate(data);
  const { version } = await api('empresa', 'PUT', { data, version: snapshot.version });
  snapshot = { version, data };
  page = next;
  render();
}

function onForm(id, callback, success = 'Registro salvo.') {
  $(id).onsubmit = event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    if (Object.values(fields).some(value => typeof value === 'string' && value !== '' && !value.trim())) {
      message('Preencha os campos com valores válidos.');
      return;
    }
    action(() => callback(fields), success);
  };
}

function renderDre(data) {
  view.innerHTML += '<section class="card"><form id="periodo">' +
    input('Data inicial', 'inicio', 'type="date" value="' + inicio + '"') +
    input('Data final', 'fim', 'type="date" value="' + fim + '"') + button('Aplicar período') + '</form></section>';
  const result = dre(data, inicio, fim);
  const percent = value => result.receita ? (100 * value / result.receita).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
  const metrics = [
    ['Receita', money(result.receita)], ['Unidades vendidas', result.quantidade],
    ['Lucro bruto', money(result.bruto)], ['Margem bruta', percent(result.bruto)],
    ['Lucro líquido', money(result.liquido)], ['Margem líquida', percent(result.liquido)]
  ];
  view.innerHTML += '<div class="cards">' + metrics.map(([title, value]) =>
    '<div class="card">' + title + '<strong>' + value + '</strong></div>').join('') + '</div><h2>Custos e gastos do período</h2>' +
    table(['Conta', 'Valor'], [
      ['Custo dos produtos vendidos', money(result.produtos)], ['Sacolas e embalagens', money(result.embalagens)],
      ['Despesas operacionais', money(result.despesas)], ['Compras de insumos', money(result.compras)],
      ['Compras de equipamentos', money(result.equipamentos)]
    ]) + '<p>A DRE gerencial reconhece receita e custos ao concluir o pedido. Compras de insumos e equipamentos aparecem como desembolsos separados.</p>';
  onForm('#periodo', fields => {
    if (fields.inicio && fields.fim && fields.inicio > fields.fim) throw new Error('A data final deve ser igual ou posterior à inicial.');
    ({ inicio, fim } = fields);
    render();
  }, '');
}

function renderProducts(data) {
  view.innerHTML += details('Cadastrar produto', 'produto',
    input('Nome', 'nome', 'required maxlength="160"') + input('SKU', 'sku', 'maxlength="60"') +
    num('Custo de produção por unidade (R$)', 'custo', 'required') + num('Preço de venda (R$)', 'preco', 'required')) +
    table(['Produto', 'SKU', 'Custo unitário', 'Preço', 'Em estoque', ''], data.produtos.map(product => [
      esc(product.nome), esc(product.sku), money(product.custo), money(product.preco), saldo(data, product.id),
      '<button data-edit="' + product.id + '">Editar</button>'
    ]));
  let editId;
  view.querySelectorAll('[data-edit]').forEach(el => el.onclick = () => {
    editId = el.dataset.edit;
    const product = data.produtos.find(item => item.id === editId);
    const form = $('#produto');
    form.closest('details').open = true;
    form.closest('details').querySelector('summary').textContent = 'Editar produto';
    for (const key of ['nome', 'sku', 'custo', 'preco']) {
      form.elements[key].value = ['custo', 'preco'].includes(key) ? product[key] / 100 : product[key];
    }
    form.elements.nome.focus();
  });
  onForm('#produto', fields => change(store => {
    const sku = fields.sku.trim();
    if (sku && store.produtos.some(item => item.id !== editId && item.sku.toLowerCase() === sku.toLowerCase())) {
      throw new Error('Este SKU já está em uso.');
    }
    const product = { id: editId || crypto.randomUUID(), nome: fields.nome.trim(), sku, custo: centavos(fields.custo), preco: centavos(fields.preco) };
    if (editId) Object.assign(store.produtos.find(item => item.id === editId), product);
    else store.produtos.push(product);
  }));
}

function renderStock(data) {
  const items = [...data.produtos, ...data.materiais];
  const unit = item => item?.tipo === 'Filamento' ? 'g' : 'un.';
  view.innerHTML += details('Cadastrar insumo', 'material', input('Nome / cor', 'nome', 'required maxlength="160"') +
    select('Tipo', 'tipo', ['Filamento', 'Embalagem', 'Outro'].map(type => [type, type]))) +
    (items.length ? details('Registrar entrada ou saída', 'movimento',
      select('Item', 'item', records(items)) + select('Movimento', 'sinal', [['1', 'Entrada'], ['-1', 'Saída']]) +
      input('Quantidade em g ou un.', 'quantidade', 'type="number" required min=".001" step=".001"') +
      input('Data', 'data', 'type="date" required value="' + hoje() + '"') +
      input('Descrição', 'descricao', 'required maxlength="160"')) : '') +
    table(['Item', 'Tipo', 'Saldo'], items.map(item => [
      esc(item.nome), esc(item.tipo || 'Produto'), saldo(data, item.id) + ' ' + unit(item)
    ])) + '<h2>Movimentações</h2>' + table(['Data', 'Item', 'Quantidade', 'Descrição'],
    data.movimentos.slice().reverse().map(mov => {
      const item = items.find(record => record.id === mov.item);
      return [date(mov.data), esc(item?.nome), mov.quantidade + ' ' + unit(item), esc(mov.descricao)];
    }));
  onForm('#material', fields => change(store => store.materiais.push({ id: crypto.randomUUID(), ...fields, nome: fields.nome.trim() })));
  if (items.length) {
    onForm('#movimento', fields => change(store => {
      const quantidade = Number(fields.quantidade) * Number(fields.sinal);
      if (unit(items.find(item => item.id === fields.item)) !== 'g' && !Number.isInteger(quantidade)) {
        throw new Error('Informe uma quantidade inteira para itens em unidades.');
      }
      if (saldo(store, fields.item) + quantidade < -0.00001) throw new Error('Saldo insuficiente para esta saída.');
      store.movimentos.push({ ...fields, quantidade });
    }));
  }
}

function renderCalculator(data) {
  view.innerHTML += '<section class="card"><form id="calculo">' +
    input('Cliente', 'cliente', 'required maxlength="160"') +
    select('Produto cadastrado', 'produto', [['', 'Personalizado'], ...records(data.produtos)]) +
    input('Descrição para o cliente', 'descricao', 'required maxlength="240"') +
    select('Origem do produto', 'origem', [['producao', 'Produzir sob encomenda'], ['estoque', 'Usar estoque de produtos']]) +
    input('Quantidade', 'quantidade', 'type="number" required min="1" max="1000000" step="1" value="1"') +
    select('Filamento para baixar', 'filamento', [['', 'Sem baixa'], ...records(data.materiais.filter(item => item.tipo === 'Filamento'))]) +
    input('Filamento por peça (g)', 'gramas', 'type="number" min="0" step=".001"') + num('Preço do filamento (R$/kg)', 'kg') +
    num('Horas por peça', 'horas') + num('Custo por hora (R$)', 'custoHora') +
    num('Outros custos por peça (R$)', 'extras') +
    select('Insumo para baixar', 'insumo', [['', 'Sem baixa'], ...records(data.materiais.filter(item => item.tipo !== 'Filamento'))]) +
    input('Unidades de insumo por peça', 'unidadesEmbalagem', 'type="number" min="0" step="1"') +
    num('Sacolas e embalagens por peça (R$)', 'embalagem') + num('Margem bruta desejada (%)', 'margem', 'value="30" max="99.99"') +
    num('Preço final por peça (R$)', 'preco', 'placeholder="Usar valor sugerido"') +
    input('Validade', 'validade', 'type="date"') +
    '<label class="wide">Condições comerciais<textarea name="condicoes" maxlength="1500" placeholder="Prazo, pagamento ou entrega"></textarea></label>' +
    '<output id="resultado" class="wide" aria-live="polite"></output>' + button('Salvar orçamento') + '</form></section>';
  const form = $('#calculo');
  const fieldsFor = fields => ({
    ...fields,
    quantidade: Number(fields.quantidade), gramas: Number(fields.gramas),
    unidadesEmbalagem: Number(fields.unidadesEmbalagem), estoquePronto: fields.origem === 'estoque'
  });
  const preview = () => {
    const fields = fieldsFor(Object.fromEntries(new FormData(form)));
    const result = calcular(fields);
    $('#resultado').textContent = result.quantidade > 0 && Number(fields.margem) < 100
      ? 'Custo por peça ' + money(result.custoProduto + result.custoEmbalagem) +
        ' · Preço sugerido ' + money(result.sugerido) + ' · Total do orçamento ' + money(result.total)
      : 'Revise a quantidade e a margem.';
  };
  form.oninput = preview;
  form.elements.produto.onchange = () => {
    const product = data.produtos.find(item => item.id === form.elements.produto.value);
    if (product) {
      form.elements.descricao.value = product.nome;
      form.elements.extras.value = product.custo / 100;
      form.elements.preco.value = product.preco / 100;
      for (const key of ['gramas', 'kg', 'horas', 'custoHora']) form.elements[key].value = '';
    }
    preview();
  };
  preview();
  onForm('#calculo', values => change(store => {
    const fields = fieldsFor(values);
    if (fields.estoquePronto && !fields.produto) throw new Error('Selecione um produto cadastrado para usar o estoque.');
    if (!fields.estoquePronto && fields.filamento && !fields.gramas) throw new Error('Informe o consumo de filamento por peça.');
    if (fields.insumo && !fields.unidadesEmbalagem) throw new Error('Informe o consumo de insumo por peça.');
    const result = calcular(fields);
    if (result.valor <= 0 || !Number.isSafeInteger(result.total)) throw new Error('Informe um preço de venda válido.');
    const codigo = String(store.orcamentos.length + 1).padStart(4, '0');
    store.orcamentos.push({ ...fields, ...result, codigo, id: crypto.randomUUID(), criado: hoje(), status: 'Orçamento' });
  }, 'Orçamentos'));
}

function printQuote(order) {
  const page = $('#impressao');
  page.innerHTML = '<h1>Nika Lab 3D</h1><h2>Orçamento ' + order.codigo + '</h2><p>Cliente · ' +
    esc(order.cliente) + '</p><p>Emissão · ' + date(order.criado) + (order.validade ? ' | Validade · ' + date(order.validade) : '') +
    '</p>' + table(['Descrição', 'Quantidade', 'Valor unitário', 'Total'], [[
      esc(order.descricao), order.quantidade, money(order.valor), money(order.total)
    ]]) + '<p><strong>Total ' + money(order.total) + '</strong></p>' +
    (order.condicoes ? '<h2>Condições comerciais</h2><p>' + esc(order.condicoes).replace(/\r?\n/g, '<br>') + '</p>' : '');
  const title = document.title;
  document.title = 'Nika Lab 3D - Orçamento ' + order.codigo;
  page.hidden = false;
  try {
    window.print();
  } finally {
    page.hidden = true;
    document.title = title;
  }
}

function renderOrders(data, quotes) {
  const list = data.orcamentos.filter(item => (item.status === 'Orçamento') === quotes).slice().reverse();
  view.innerHTML += table(['Nº', 'Cliente e descrição', 'Qtd.', 'Total', 'Status', 'Ações'], list.map(item => [
    item.codigo, esc(item.cliente) + '<br>' + esc(item.descricao), item.quantidade, money(item.total), esc(item.status),
    '<button data-action="pdf" data-id="' + item.id + '">PDF</button>' +
      (quotes ? '<button data-action="pedido" data-id="' + item.id + '">Criar pedido</button>' : '') +
      (item.status === 'Pendente' ? '<button data-action="concluir" data-id="' + item.id + '">Concluir</button>' +
        '<button data-action="cancelar" data-id="' + item.id + '">Cancelar</button>' : '')
  ]));
  view.querySelectorAll('[data-action]').forEach(el => el.onclick = () => {
    const { id, action: type } = el.dataset;
    if (type === 'pdf') return printQuote(list.find(item => item.id === id));
    action(() => change(store => {
      const item = store.orcamentos.find(record => record.id === id);
      if (type === 'concluir') concluir(store, item, hoje());
      if (type === 'pedido') item.status = 'Pendente';
      if (type === 'cancelar') item.status = 'Cancelado';
    }, 'Pedidos'), type === 'concluir' ? 'Pedido concluído e estoque atualizado.' : 'Pedido atualizado.');
  });
}

function renderExpenses(data) {
  view.innerHTML += details('Lançar gasto', 'gasto',
    input('Descrição', 'descricao', 'required maxlength="160"') + select('Categoria', 'tipo', Object.entries(categories)) +
    input('Valor (R$)', 'valor', 'type="number" required min=".01" step=".01"') + input('Data', 'data', 'type="date" required value="' + hoje() + '"')) +
    table(['Data', 'Descrição', 'Categoria', 'Valor'], data.gastos.slice().reverse().map(gasto => [
      date(gasto.data), esc(gasto.descricao), categories[gasto.tipo], money(gasto.valor)
    ]));
  onForm('#gasto', fields => change(store => store.gastos.push({ ...fields, valor: centavos(fields.valor) })));
}

function render() {
  $('#nav').hidden = !snapshot;
  $('#sair').hidden = !snapshot;
  $('#impressao').hidden = true;
  if (!snapshot) {
    view.innerHTML = '<section class="card login"><h1>Entrar no sistema</h1><form id="login">' +
      input('Senha', 'senha', 'type="password" autocomplete="current-password" required class="wide"') +
      button('Entrar') + '</form></section>';
    return onForm('#login', async fields => {
      await api('login', 'POST', fields);
      snapshot = await api('empresa');
      render();
    }, '');
  }
  $('#nav').innerHTML = pages.map(name => '<button type="button" data-page="' + name + '"' +
    (page === name ? ' aria-current="page"' : '') + '>' + name + '</button>').join('');
  $('#nav').querySelectorAll('button').forEach(el => el.onclick = () => {
    if (busy) return;
    page = el.dataset.page;
    message();
    render();
  });
  view.innerHTML = '<h1>' + page + '</h1>';
  const { data } = snapshot;
  const handlers = {
    DRE: renderDre, Produtos: renderProducts, Estoque: renderStock, Calculadora: renderCalculator,
    Orçamentos: store => renderOrders(store, true), Pedidos: store => renderOrders(store, false), Gastos: renderExpenses
  };
  handlers[page](data);
}

$('#sair').onclick = () => action(async () => {
  await api('logout', 'POST');
  snapshot = undefined;
  page = 'DRE';
  render();
}, '');
try {
  snapshot = await api('empresa');
} catch (error) {
  if (error.status !== 401) message(error.message);
}
render();
