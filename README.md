# PixMultiNotifica

Primeira versão demonstrativa de um painel para centralizar recebimentos Pix e preparar mensagens de WhatsApp para dono, gerente e caixa.

## Executar

Requer Node.js 20 ou superior. Não há dependências externas.

```sh
npm start
```

Abra http://localhost:3000 no navegador. Para usar outra porta, defina a variável de ambiente `PORT` antes de iniciar.

```sh
npm run check
npm test
```

## Funcionalidades

- Painel com totais do dia e últimos recebimentos.
- Cadastro de nome, função e WhatsApp brasileiro com DDD; bloqueio de números duplicados.
- Ativação, pausa e remoção de destinatários.
- Histórico pesquisável por pagador ou referência.
- Simulação de recebimento com mensagens individuais para destinatários ativos.
- Prévia de mensagens e link para abrir o WhatsApp, com envio manual pelo usuário.
- Nome da empresa configurável e interface adaptada a celular.
- Dados salvos no `localStorage` do navegador. Pessoas iniciais são exemplos sem telefone.

## Limites desta versão

**Nenhum Pix é confirmado pelo banco e nenhuma mensagem é enviada automaticamente.** Todo recebimento e mensagem indica que é demonstração. Abrir o WhatsApp não comprova envio ou entrega. O histórico registra somente mensagens preparadas.

Os dados ficam neste navegador, sem autenticação, banco de dados ou sincronização entre aparelhos. Evite dados reais de clientes nesta demonstração. Limpar os dados do navegador apaga os registros. O servidor local aceita conexões apenas de `127.0.0.1` e publica somente os arquivos da interface.

## Integração para uso real

1. Escolher banco/provedor com API Pix e webhook de confirmação. Validar autenticidade dos eventos no backend, persistir os identificadores de transação e impedir processamento duplicado.
2. Integrar a API oficial do WhatsApp Business no backend, com consentimento dos destinatários e modelos de mensagem aprovados quando exigidos pelo provedor.
3. Implementar login, permissões por empresa, banco de dados, fila com novas tentativas e estados reais de envio/entrega.
4. Configurar segredos somente no backend por variáveis de ambiente, com HTTPS e política de proteção de dados.

Nunca coloque credenciais bancárias ou tokens do WhatsApp no JavaScript do navegador. Arquivos `.env` são ignorados pelo Git.
