# PixMultiNotifica

Painel com login para centralizar recebimentos Pix e preparar mensagens de WhatsApp para dono, gerente e caixa. Versão 0.2: armazenamento no servidor, edição da equipe, lojas, filtros e tela de conferência do caixa.

## Executar

Requer Node.js 20 ou superior. Não há dependências externas.

```sh
npm start
```

Abra http://localhost:3000 no navegador e crie o primeiro administrador com usuário e senha de pelo menos 12 caracteres. O cadastro inicial só está disponível enquanto não existe administrador. Não há senha padrão. Para usar outra porta, defina a variável de ambiente `PORT` antes de iniciar.

```sh
npm run check
npm test
```

## Funcionalidades

- Painel com totais do dia e últimos recebimentos.
- Cadastro de nome, função e WhatsApp brasileiro com DDD; bloqueio de números duplicados.
- Edição, ativação, pausa e remoção de destinatários. A edição preserva a pausa e não altera mensagens já preparadas.
- Cadastro de lojas. Cada pessoa acompanha uma unidade ou todas as lojas.
- Histórico pesquisável por pagador ou referência, com filtros de loja, data e valor exato e total da seleção.
- Tela do caixa com valor e horário em destaque, filtro de loja e nome exato do caixa.
- Simulação com mensagens somente para destinatários ativos da loja. Repetir a mesma requisição não duplica recebimentos ou avisos.
- Prévia de mensagens e link para abrir o WhatsApp. Estados reais desta versão: `prepared` (preparada) e `opened` (link acessado). Não representam envio ou entrega.
- Login de um administrador por instalação, senha derivada com scrypt, cookie de sessão HttpOnly/SameSite=Strict, validação de origem e limite de tentativas de login.
- Armazenamento em arquivo JSON no servidor, com alterações serializadas e substituição atômica. Atualização entre sessões abertas a cada 15 segundos. Datas comerciais no fuso de Brasília.
- Nome da empresa configurável e interface adaptada a celular.

## Limites desta versão

**Nenhum Pix é confirmado pelo banco e nenhuma mensagem é enviada automaticamente.** Todo recebimento e mensagem indica que é demonstração. Abrir o WhatsApp não comprova envio ou entrega. O histórico registra somente mensagens preparadas.

O armazenamento fica em `.data/app.json`, ignorado pelo Git e inacessível pela lista de arquivos públicos do servidor. O arquivo contém os cadastros, recebimentos, mensagens e hash da senha. Faça backup dessa pasta com o servidor parado. Não há recuperação automática de senha nesta versão. As sessões ficam em memória por até 12 horas e um reinício exige novo login.

O servidor aceita conexões apenas em `127.0.0.1`. Portanto, o app ainda não está acessível de outros aparelhos. Para hospedagem, use HTTPS com proxy reverso e configure `PUBLIC_ORIGIN` com a origem pública exata (sem barra final), para validar Host/Origin e emitir cookie Secure. Nunca publique a pasta `.data` como arquivos estáticos. O armazenamento JSON se destina a uma única instância do servidor; múltiplos processos precisam de um banco transacional compartilhado.

As funções Dono(a), Gerente e Caixa organizam destinatários; ainda não são permissões de acesso. Há apenas uma empresa e um administrador por instalação. Autorização por função, múltiplas empresas e recuperação de senha continuam pendentes.

Os dados antigos de demonstração do `localStorage` continuam no navegador. Não são importados automaticamente para o novo cadastro no servidor. A nova instalação começa vazia e não mistura exemplos antigos com o seu espaço.

## Banco informado: CAIXA, pessoa física

A compatibilidade da integração está pendente. Não há adaptador bancário nem webhook público habilitado nesta etapa. Não implementamos uma confirmação fictícia nem usamos captura de tela de comprovantes como confirmação.

A [oferta pública de Pix Automático da CAIXA](https://www.caixa.gov.br/empresa/pagamentos-recebimentos/recebimentos/pix-automatico/Paginas/default.aspx) descreve recebimentos recorrentes para pessoa jurídica. Isso não confirma acesso a uma API de recebimentos para a conta de pessoa física informada pelo usuário. Antes de implementar o conector, precisamos confirmar com a CAIXA uma modalidade compatível e obter a documentação de homologação correspondente.

## Integração para uso real

1. Confirmar uma modalidade compatível de banco/provedor com API Pix e webhook. Validar a autenticidade dos eventos no backend e deduplicar pelo identificador bancário da transação. A proteção atual é para requisições de simulação, não para eventos bancários ainda não integrados.
2. Integrar a API oficial do WhatsApp Business no backend, com consentimento dos destinatários e modelos de mensagem aprovados quando exigidos pelo provedor.
3. Migrar o armazenamento para banco transacional antes de escalar, acrescentar permissões por usuário/empresa e implementar fila com novas tentativas e estados de envio/entrega baseados nos retornos do provedor. Não marcar falha, enviado ou entregue sem evidência do provedor.
4. Configurar segredos somente no backend por variáveis de ambiente, com HTTPS e política de proteção de dados.

Nunca coloque credenciais bancárias ou tokens do WhatsApp no JavaScript do navegador. Arquivos `.env` são ignorados pelo Git.
