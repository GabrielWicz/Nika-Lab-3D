# Nika Lab 3D

- [Catálogo público](catalogo/index.html) · página de produtos, imagens publicadas, originais e arquivo ZIP.
- [Sistema interno](sistema/) · produtos, estoque, calculadora, orçamentos, pedidos, gastos e DRE.

Se o catálogo estiver publicado a partir da raiz do repositório, a nova rota é `/catalogo/`. Em serviços com configuração de diretório de publicação, use `catalogo` para servir a página na raiz do site.

## Sistema interno

Requer Node.js 24 ou mais recente. No PowerShell, na raiz do repositório:

```powershell
$credencial = Read-Host 'Senha do sistema (mínimo de 12 caracteres)' -AsSecureString
$env:NIKA_SENHA = [System.Net.NetworkCredential]::new('', $credencial).Password
node sistema/server.mjs
```

Abra [o sistema local](http://127.0.0.1:3000) e entre com a senha definida. O sistema tem um acesso de administrador e roda no computador que iniciou o servidor. O SQLite é gratuito e cria o banco em `sistema/dados/empresa.sqlite`. Para fazer backup, pare o servidor e copie o banco para um local privado. A pasta de dados fica fora do Git.

1. Cadastre os produtos. Em **Estoque**, cadastre insumos e registre entradas. Filamentos são registrados em gramas e os demais itens em unidades.
2. Na **Calculadora**, informe os custos por peça, a quantidade e a margem desejada. Ao selecionar um produto cadastrado, o sistema preenche o custo de produção em **Outros custos por peça**. Substitua esse valor se for detalhar aquele mesmo custo nos campos de filamento e horas.
3. Em **Orçamentos**, use **PDF** e escolha **Salvar como PDF** no diálogo de impressão. O documento inclui descrição, valores e condições comerciais. Para iniciar a produção, use **Criar pedido**.
4. Em **Pedidos**, conclua a venda para baixar o estoque selecionado e registrar o resultado na DRE. Pedidos pendentes ainda aguardam o consumo dos itens.
5. Em **Gastos**, lance despesas operacionais, compras de insumos e equipamentos. Registre as quantidades adquiridas em **Estoque**.

A DRE gerencial usa a data de conclusão dos pedidos. O lucro bruto deduz os custos das peças e das embalagens. O lucro líquido também deduz as despesas operacionais, incluindo taxas e impostos quando lançados nessa categoria. Compras de insumos aparecem separadamente para evitar dupla contagem com o custo das peças. Equipamentos aparecem como desembolsos, sem cálculo automático de depreciação.
