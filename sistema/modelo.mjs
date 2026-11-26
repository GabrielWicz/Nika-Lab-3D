export const centavos = value => Math.round(Number(value || 0) * 100);
export const hoje = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export function calcular({ quantidade, gramas, kg, horas, custoHora, extras, embalagem, margem, preco }) {
  const custoProduto = centavos(gramas * kg / 1000 + horas * custoHora + extras);
  const custoEmbalagem = centavos(embalagem);
  const sugerido = Math.ceil((custoProduto + custoEmbalagem) / (1 - margem / 100));
  const valor = preco === '' ? sugerido : centavos(preco);
  return { quantidade, custoProduto, custoEmbalagem, valor, sugerido, total: quantidade * valor };
}

export function saldo(data, item) {
  return Math.round(data.movimentos.filter(mov => mov.item === item)
    .reduce((total, mov) => total + mov.quantidade, 0) * 1000) / 1000;
}

export function concluir(data, pedido, dataConclusao) {
  if (pedido.status !== 'Pendente') throw new Error('O pedido já foi processado.');
  const consumo = [
    [pedido.produto, pedido.estoquePronto ? pedido.quantidade : 0],
    [pedido.filamento, pedido.estoquePronto ? 0 : pedido.gramas * pedido.quantidade],
    [pedido.insumo, pedido.unidadesEmbalagem * pedido.quantidade]
  ];
  const totais = new Map();
  for (const [item, quantidade] of consumo) {
    if (item && quantidade) totais.set(item, Math.round(((totais.get(item) || 0) + quantidade) * 1000) / 1000);
  }
  for (const [item, quantidade] of totais) {
    if (saldo(data, item) < quantidade) {
      const nome = [...data.produtos, ...data.materiais].find(registro => registro.id === item)?.nome;
      throw new Error('Estoque insuficiente para ' + nome + '.');
    }
  }
  for (const [item, quantidade] of totais) {
    data.movimentos.push({ item, quantidade: -quantidade, data: dataConclusao, descricao: 'Pedido ' + pedido.codigo });
  }
  pedido.status = 'Concluído';
  pedido.conclusao = dataConclusao;
}

export function dre(data, inicio, fim) {
  const noPeriodo = valor => (!inicio || valor >= inicio) && (!fim || valor <= fim);
  const total = { receita: 0, quantidade: 0, produtos: 0, embalagens: 0, despesas: 0, compras: 0, equipamentos: 0 };
  for (const pedido of data.orcamentos) {
    if (pedido.status !== 'Concluído' || !noPeriodo(pedido.conclusao)) continue;
    total.receita += pedido.total;
    total.quantidade += pedido.quantidade;
    total.produtos += pedido.custoProduto * pedido.quantidade;
    total.embalagens += pedido.custoEmbalagem * pedido.quantidade;
  }
  for (const gasto of data.gastos) {
    if (noPeriodo(gasto.data)) total[gasto.tipo] += gasto.valor;
  }
  total.bruto = total.receita - total.produtos - total.embalagens;
  total.liquido = total.bruto - total.despesas;
  return total;
}
