# Focuser API V1

API REST para gerenciamento de hábitos e produtividade, com autenticação segura, check-ins diários, dashboard, acompanhamento de progresso e análises por inteligência artificial.

**Stack:** Node.js 22+ · Express 4 · JavaScript · MongoDB · Prisma 6 · Zod

## Sumário

- [Visão geral](#visão-geral)
- [Requisitos](#requisitos)
- [Instalação](#instalação)
- [Configuração do MongoDB](#configuração-do-mongodb)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Scripts e testes](#scripts-e-testes)
- [Autenticação e segurança](#autenticação-e-segurança)
- [Endpoints](#endpoints)
- [Regras de negócio e cálculos](#regras-de-negócio-e-cálculos)
- [Análise de hábitos com Groq](#análise-de-hábitos-com-groq)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Códigos de erro](#códigos-de-erro)

## Visão geral

O Focuser API é o backend responsável por gerenciar os dados e as funcionalidades da aplicação Focuser V1.

Principais funcionalidades:

- **Autenticação:** cadastro com verificação de e-mail, login com 2FA por código e sessão persistente por cookie.
- **Gerenciamento de hábitos:** criação, consulta, edição, arquivamento e exclusão, com categoria definida automaticamente pelo Groq.
- **Metas:** criação, atualização, progresso, arquivamento e consulta isolada por usuário.
- **Sessões de foco:** início, pausa, retomada, conclusão e histórico persistido no servidor.
- **Leituras:** livros, progresso de páginas e registros diários de páginas/minutos lidos.
- **Check-ins:** registro e consulta de conclusões diárias, com suporte a registros retroativos.
- **Dashboard:** resumo diário dos hábitos e das conclusões.
- **Progresso:** estatísticas gerais, histórico diário, taxas de conclusão e sequências.
- **Inteligência artificial:** análise de desempenho baseada em métricas calculadas no servidor.
- **Segurança:** validação estrita de entradas, isolamento entre usuários, proteção CSRF, limites de requisições e tratamento padronizado de erros.

## Requisitos

Antes de começar, verifique se você possui:

- Node.js 22 ou superior.
- npm.
- MongoDB 7 ou MongoDB Atlas.
- MongoDB configurado como replica set.
- Chave de API de um provedor de IA, caso queira utilizar as análises inteligentes.

## Instalação

Clone o repositório e instale as dependências:

```bash
git clone <URL_DO_REPOSITORIO>
cd focuser-api
npm install
```

Configure as variáveis de ambiente:

```bash
cp .env.example .env
```

Preencha as variáveis obrigatórias no arquivo `.env`, especialmente `JWT_SECRET` e `DATABASE_URL`.

Configure `RESEND_API_KEY` e `RESEND_FROM` conforme indicado no `.env.example`. Crie uma chave de API no Resend e configure como remetente um endereço de domínio verificado na sua conta. O cadastro e os logins exigem envio de e-mail; sem essas variáveis, a API responde `503 EMAIL_NOT_CONFIGURED`. Os códigos expiram em 10 minutos, são de uso único e permitem até cinco tentativas por desafio.

Gere o Prisma Client e sincronize o schema com o banco:

```bash
npx prisma generate
npx prisma db push
```

> **Importante:** execute `prisma db push` antes de iniciar a aplicação. Essa etapa sincroniza as coleções e os índices definidos no schema, incluindo as restrições de unicidade.

Inicie o servidor em desenvolvimento:

```bash
npm run dev
```

Em `NODE_ENV=development` (padrão local), a API escuta em `0.0.0.0` e aceita origens CORS de qualquer endereço/IP para facilitar testes em rede local. Isso não desativa autenticação, proteção CSRF via `X-Focuser-Client` nem limites de requisições. Em produção, a API continua restrita às origens explícitas em `CORS_ORIGINS`.

Verifique se a API está funcionando acessando:

`http://localhost:3000/api/health`

## Configuração do MongoDB

O Prisma utilizado neste projeto requer um MongoDB configurado como replica set para operações transacionais, incluindo a exclusão de hábitos e seus respectivos check-ins.

### Opção 1: MongoDB local com Docker

Inicie um container MongoDB:

```bash
docker run -d \
  --name focuser-mongo \
  -p 27017:27017 \
  mongo:7 \
  --replSet rs0 \
  --bind_ip_all
```

Inicialize o replica set:

```bash
docker exec focuser-mongo mongosh --eval \
  "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
```

Configure a conexão no `.env`:

```dotenv
DATABASE_URL="mongodb://localhost:27017/focuser?replicaSet=rs0&directConnection=true"
```

### Opção 2: MongoDB Atlas

O MongoDB Atlas também pode ser utilizado. Configure a URI de conexão fornecida pelo Atlas em `DATABASE_URL` e certifique-se de que as credenciais e as permissões de acesso estejam corretas.

## Variáveis de ambiente

As variáveis utilizadas pela aplicação devem ser configuradas no arquivo `.env`, tomando `.env.example` como referência.

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | URI de conexão com o MongoDB. |
| `JWT_SECRET` | Segredo utilizado para assinar os JWTs. |
| `CORS_ORIGINS` | Lista explícita de origens autorizadas. |
| `RESEND_API_KEY`, `RESEND_FROM` | Chave da API Resend e endereço remetente para envio dos códigos de verificação e login. |
| `GROQ_API_KEY` | Chave privada da API Groq, usada para análise de hábitos, classificação de hábitos e recomendação opcional de ISBN. |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Credenciais privadas necessárias para o upload obrigatório de avatar no cadastro e uploads de banner. O segredo fica somente na API. |
| `CLOUDINARY_FOLDER` | Pasta base das imagens do perfil no Cloudinary (opcional; padrão `focuser/avatars`). |
| `GOOGLE_BOOKS_API_KEY` | Chave opcional do Google Books API para maior quota de pesquisa de capas. |
| `TEST_DATABASE_URL` | Conexão com o banco descartável de testes de integração. |

`GROQ_API_KEY` é necessária para a análise de hábitos, para criar hábitos (a categoria é classificada pelo Groq) e para a recomendação opcional de ISBN. `GROQ_MODEL` e `GROQ_TIMEOUT_MS` configuram o modelo e o tempo limite compartilhados. Consulte `.env.example` para os demais parâmetros.

Se o Groq estiver sem chave ou indisponível, a criação do hábito retorna um erro explícito em vez de salvar uma categoria inventada.

**Nunca versione o arquivo `.env` nem exponha segredos em respostas da API, logs ou código do cliente.**

## Scripts e testes

### Testes unitários

Executam os testes de cálculos e regras independentes do banco de dados:

```bash
npm run test:unit
```

### Testes de integração

Os testes de integração exigem um banco MongoDB separado e descartável. O nome do banco precisa conter `test`.

Exemplo de configuração:

```bash
export TEST_DATABASE_URL="mongodb://localhost:27017/focuser_test?replicaSet=rs0&directConnection=true"

DATABASE_URL="$TEST_DATABASE_URL" npx prisma db push

npm run test:integration
```

> **Atenção:** utilize exclusivamente um banco descartável para os testes de integração. Não execute a preparação dos testes contra o banco de produção.

Quando `TEST_DATABASE_URL` não estiver configurada, os testes de integração são ignorados (*skipped*), e não considerados aprovados.

### Auditoria de dependências

```bash
npm run audit
```

Executa a auditoria das dependências de produção conforme o script configurado no projeto.

## Autenticação e segurança

### Sessão JWT

A API utiliza JWT com algoritmo HS256 e validade de sete dias.

O token é armazenado exclusivamente no cookie `focuser_token`, com as seguintes propriedades:

- `httpOnly`: impede o acesso direto ao cookie por JavaScript no navegador.
- `SameSite=Lax`: restringe o envio do cookie em determinados contextos entre sites.
- `Secure`: habilitado em produção, exigindo HTTPS para o envio do cookie.

O token não é retornado no corpo das respostas.

### Logout e revogação

O logout incrementa o campo `tokenVersion` do usuário e limpa o cookie de sessão. Tokens emitidos anteriormente são rejeitados pela API.

### Proteção CSRF

Todas as requisições `POST`, `PATCH` e `DELETE` devem incluir o cabeçalho:

```http
X-Focuser-Client: web
```

Quando o cabeçalho `Origin` estiver presente, a origem deve estar autorizada em `CORS_ORIGINS`.

O cabeçalho personalizado faz parte da proteção implementada, mas não substitui, isoladamente, uma estratégia completa de proteção CSRF.

### CORS

- Em desenvolvimento, qualquer origem é aceita para chamadas da rede local.
- Em produção, origens permitidas são definidas explicitamente em `CORS_ORIGINS`.
- Requisições com credenciais habilitadas.
- Nenhuma origem curinga (`*`) é usada; as respostas refletem a origem solicitante somente em desenvolvimento.
- O cliente deve enviar cookies utilizando `credentials: 'include'`.

Exemplo:

```javascript
fetch('http://localhost:3000/api/auth/me', {
  method: 'GET',
  credentials: 'include'
});
```

### Senhas e credenciais

- Hash de senhas com bcrypt, custo 12.
- Senhas limitadas a 8–72 bytes.
- Mensagem genérica `INVALID_CREDENTIALS` para falhas de autenticação.
- Tratamento de tempo de execução destinado a reduzir diferenças temporais no login.

### Verificação de e-mail e 2FA

- O cadastro envia um código de seis dígitos para verificar o endereço antes do primeiro acesso.
- Após validar a senha, cada login envia um novo código para o e-mail; a sessão só é criada após a validação desse segundo fator.
- Em `development` e `test`, endereços terminados exatamente em `@focuser.dev` pulam a verificação e o código do login para facilitar testes; o login ainda exige senha. Esse bypass não funciona em produção.
- Os códigos expiram em 10 minutos, são armazenados somente como HMAC e aceitos uma única vez.
- Tentativas de códigos e endpoints de autenticação têm limites de requisição; o envio é feito pela API do Resend configurada no servidor.
- A troca de senha exige a senha atual e um código enviado ao e-mail; o código expira em 10 minutos, aceita até cinco tentativas e só pode ser usado uma vez. Ao confirmar, outras sessões são invalidadas.

### Perfil

- Nome, nome de usuário único (3–30 letras, números, pontos ou sublinhados), bio, fuso horário, avatar, banner, livro em leitura, livro favorito e cor de destaque são editáveis em `/app/perfil`.
- Avatar e banner usam assinaturas de upload em pastas individuais separadas no Cloudinary; o navegador envia as imagens diretamente ao provedor, sem receber o segredo da API.
- O upload requer `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET`. Apenas imagens JPG, PNG e WebP de até 5 MB são aceitas pela interface.

### Validação e isolamento de dados

- Corpos de requisição e query strings são validados com schemas estritos.
- Campos desconhecidos resultam em `400 VALIDATION_ERROR`.
- Recursos de outros usuários são tratados como inexistentes, retornando `404` quando aplicável.
- A API não confia em identificadores de usuário enviados pelo cliente para definir a propriedade dos dados.

## Endpoints

Base URL local:

`http://localhost:3000/api`

### Autenticação e perfil

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/health` | Verifica a disponibilidade da API. |
| `POST` | `/auth/registration-avatar-signature` | Gera uma assinatura temporária para a foto obrigatória do cadastro. |
| `POST` | `/auth/registration-banner-signature` | Gera uma assinatura temporária para o banner opcional do cadastro. |
| `POST` | `/auth/register` | Cria uma conta com nome, username único e foto; aceita banner opcional. Envia código de verificação do e-mail (exceto `@focuser.dev` em desenvolvimento/teste). |
| `POST` | `/auth/verify-email` | Valida o código do cadastro. Body: `{ email, code }`. |
| `POST` | `/auth/resend-verification` | Solicita novo código de verificação. Body: `{ email }`. |
| `POST` | `/auth/login` | Valida a senha e envia o código do 2FA; contas `@focuser.dev` em desenvolvimento/teste recebem a sessão diretamente. |
| `POST` | `/auth/verify-login` | Valida o código do 2FA e define o cookie de sessão. Body: `{ email, code }`. |
| `POST` | `/auth/logout` | Revoga a sessão e limpa o cookie. |
| `GET` | `/auth/me` | Retorna os dados do usuário autenticado. |
| `GET` | `/users/me` | Consulta o perfil do usuário. |
| `GET` | `/users/by-username/:username` | Consulta os dados públicos de uma pessoa pelo username, sem autenticação. |
| `PUT` | `/users/me/reading-focus` | Publica/renova a sessão de leitura em foco. Body: `{ bookId, sessionId }`; o heartbeat expira após 2 minutos sem renovação. |
| `DELETE` | `/users/me/reading-focus` | Limpa o status de leitura em foco da sessão correspondente. Body: `{ sessionId }`. |
| `GET` | `/friends` | Lista amizades, pedidos recebidos e pedidos enviados do usuário autenticado. |
| `GET` | `/friends/status/:username` | Consulta o estado da amizade com uma pessoa. |
| `POST` | `/friends/requests` | Envia um pedido. Body: `{ username }`. |
| `POST` | `/friends/requests/:id/accept` | Aceita um pedido recebido. |
| `DELETE` | `/friends/requests/:id` | Recusa um pedido recebido ou cancela um enviado. |
| `DELETE` | `/friends/:id` | Remove uma amizade existente usando o ID do outro usuário. |
| `PATCH` | `/users/me` | Atualiza os campos permitidos do perfil. |
| `POST` | `/users/me/avatar-signature` | Gera parâmetros assinados para upload de avatar no Cloudinary. |
| `POST` | `/users/me/banner-signature` | Gera parâmetros assinados para upload de banner no Cloudinary. |
| `POST` | `/users/me/password-change` | Valida a senha atual e envia código de confirmação. Body: `{ currentPassword, newPassword }`. |
| `POST` | `/users/me/password-change/verify` | Confirma o código e altera a senha. Body: `{ code, newPassword }`; renova a sessão atual e revoga as demais. |

O perfil público inclui `status: "FOCUS"` enquanto houver uma sessão de foco do timer em andamento ou uma sessão de leitura renovada nos últimos 2 minutos; nos demais estados, `status` é `null`. Em uma sessão de leitura, `currentBook` mostra o livro da sessão ativa; caso contrário, mostra o livro escolhido como leitura atual no perfil. O campo `readingHistory` contém os 20 registros mais recentes, com livro, páginas, duração e data de cada leitura.

**Corpos das requisições**

Cadastro:

```json
{
  "name": "Usuário",
  "username": "usuario",
  "email": "usuario@example.com",
  "password": "senha_segura",
  "timezone": "America/Sao_Paulo",
  "avatarUploadId": "507f1f77bcf86cd799439011",
  "avatarUrl": "https://res.cloudinary.com/SEU_CLOUD/image/upload/v123/focuser/avatars/registration/507f1f77bcf86cd799439011/avatar.webp"
}
```

Login:

```json
{
  "email": "usuario@example.com",
  "password": "senha_segura"
}
```

Antes do cadastro, solicite uma assinatura em `/auth/registration-avatar-signature` e envie a foto ao Cloudinary com os parâmetros retornados. A assinatura é temporária e só pode ser associada a uma conta uma vez. O banner é opcional: use `/auth/registration-banner-signature` e envie também `bannerUploadId` e `bannerUrl`. O campo `timezone` é opcional. No perfil, `name`, `timezone` e `accentColor` são editáveis; `accentColor` deve usar hexadecimal no formato `#RRGGBB` e fica associado à conta.

### Hábitos

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/habits` | Cria um hábito. |
| `GET` | `/habits` | Lista hábitos com paginação e filtros. |
| `GET` | `/habits/:id` | Consulta um hábito. |
| `PATCH` | `/habits/:id` | Atualiza um hábito. |
| `DELETE` | `/habits/:id` | Exclui um hábito e seu histórico. |
| `PATCH` | `/habits/:id/archive` | Arquiva ou reativa um hábito. |
| `GET` | `/habits/:id/progress` | Consulta o progresso individual. |

Parâmetros de listagem:

- `status`: `active`, `archived` ou `all`.
- `page`: página solicitada.
- `limit`: quantidade de resultados por página.

O arquivamento recebe um campo opcional `archived`, com valor padrão `true`. Para reativar o hábito, envie `false`.

### Metas

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/goals` | Cria uma meta com valor alvo e unidade. |
| `GET` | `/goals` | Lista metas com paginação e filtro de estado. |
| `GET` | `/goals/:id` | Consulta uma meta própria. |
| `PATCH` | `/goals/:id` | Atualiza ou arquiva uma meta. |
| `POST` | `/goals/:id/progress` | Incrementa o progresso com `amount` positivo. |
| `DELETE` | `/goals/:id` | Exclui a meta sem remover sessões associadas. |

Os períodos permitidos são `DAILY`, `WEEKLY`, `MONTHLY` e `CUSTOM`. Cada usuário pode ter até 100 metas.

### Sessões de foco

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/focus-sessions` | Inicia sessão de 1 a 240 minutos (padrão: 25), opcionalmente associada a uma meta. |
| `GET` | `/focus-sessions` | Lista sessões com paginação e filtro por estado. |
| `GET` | `/focus-sessions/active` | Retorna sessão ativa ou `session: null`. |
| `GET` | `/focus-sessions/:id` | Consulta uma sessão própria. |
| `POST` | `/focus-sessions/:id/pause` | Pausa uma sessão. |
| `POST` | `/focus-sessions/:id/resume` | Retoma uma sessão pausada. |
| `POST` | `/focus-sessions/:id/complete` | Conclui e registra o tempo decorrido. |
| `POST` | `/focus-sessions/:id/cancel` | Cancela a sessão sem apagar o histórico. |

O servidor registra o tempo decorrido e permite uma única sessão em andamento ou pausada por usuário.

### Leituras

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/reading/today` | Soma páginas/minutos de hoje no fuso do usuário e lista os registros. |
| `GET` | `/reading/feed` | Lista até 50 registros recentes do usuário e de amizades aceitas, incluindo livro, páginas, minutos, data e perfil da pessoa. |
| `POST` | `/reading/isbn-lookup` | Busca edições/capas no Open Library e Google Books; Groq opcionalmente sugere uma edição. |
| `POST` | `/reading/books` | Cadastra livro, autor, ISBN, `coverId`/`coverUrl` da capa escolhida, páginas totais e página atual. |
| `GET` | `/reading/books` | Lista livros com paginação e filtro de estado. |
| `GET` | `/reading/books/:id` | Consulta um livro próprio. |
| `PATCH` | `/reading/books/:id` | Atualiza dados, ISBN/capa, progresso ou arquiva/reativa. |
| `POST` | `/reading/books/:id/logs` | Registra páginas e minutos lidos hoje; atualiza a página atual. |
| `DELETE` | `/reading/books/:id` | Exclui livro e registros associados. |

O ISBN aceita os formatos ISBN-10/ISBN-13 e é normalizado. A capa selecionada é guardada como `coverId` (Open Library) ou `coverUrl` HTTPS dos domínios permitidos (Open Library/Google Books). Cada registro é armazenado com a data local do usuário; o progresso não pode ultrapassar o total de páginas.

### Check-ins

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/habits/:id/check-ins` | Registra a conclusão de um hábito. |
| `GET` | `/habits/:id/check-ins` | Consulta o histórico de conclusões. |
| `DELETE` | `/habits/:id/check-ins/:checkInId` | Remove um check-in. |
| `GET` | `/check-ins/today` | Lista as conclusões do dia atual. |

Exemplo de registro:

```json
{
  "date": "2026-10-12"
}
```

O campo `date` é opcional. Quando omitido, utiliza-se a data atual conforme as regras de fuso horário da aplicação.

Filtros de histórico:

- `from`: data inicial.
- `to`: data final.
- `page`: página solicitada.
- `limit`: quantidade de resultados por página.

### Dashboard e progresso

| Método | Endpoint | Descrição |
|---|---|---|
| `GET` | `/dashboard` | Retorna o resumo diário. |
| `GET` | `/progress` | Retorna as estatísticas gerais. |
| `GET` | `/progress/history` | Retorna a série diária do período. |

O dashboard aceita `date` como parâmetro opcional.

O endpoint de progresso aceita `period=week` ou `period=month`, ou um intervalo personalizado por meio de `from` e `to`.

### Inteligência artificial

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/ai/analyze` | Gera uma análise do desempenho do usuário. |

Corpo da requisição:

```json
{
  "period": "month"
}
```

O campo `period` aceita `week`, `month` ou `quarter`. O padrão é `month`.

**Autenticação:** todas as rotas exigem uma sessão válida, exceto `GET /health` e as rotas públicas `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/verify-login` e `/auth/logout`.

Os métodos HTTP indicados são relativos aos endpoints apresentados. Os formatos exatos de resposta e os schemas de entrada devem ser conferidos nas implementações correspondentes.

## Formato das respostas

### Sucesso

```json
{
  "success": true,
  "data": {
    "id": "example-id"
  }
}
```

### Erro

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dados inválidos.",
    "details": {}
  }
}
```

O campo `details` é opcional. Os exemplos são ilustrativos e não representam necessariamente o conteúdo completo retornado por cada endpoint.

## Regras de negócio e cálculos

A lógica de estatísticas está centralizada em `src/services/statsCalculator.js`.

### Datas e fusos horários

- O conceito de "hoje" utiliza o fuso horário IANA definido pelo usuário em `timezone`.
- Os check-ins armazenam uma chave de data no formato `YYYY-MM-DD`, por meio do campo `dateKey`.
- Os cálculos utilizam datas civis no fuso configurado, evitando depender exclusivamente do relógio local do servidor.

### Agendamento de hábitos

Um hábito é considerado programado no dia `D` quando ambas as condições são satisfeitas:

1. `D` é igual ou posterior a `startDateKey`.
2. O dia da semana de `D` está incluído em `daysOfWeek`.

Hábitos com frequência `DAILY` são considerados programados todos os dias.

Dias não programados não contam como falhas nem como pendências.

### Taxa de conclusão

A taxa de conclusão é calculada por:

`concluídos ÷ programados`

- Retorna `null` quando não há dias programados.
- Utiliza quatro casas decimais.
- O dia atual entra no cálculo quando programado, mesmo que ainda esteja pendente.

### Sequências

**Sequência individual:** conta os dias programados consecutivos concluídos. Uma falha em um dia programado anterior encerra a sequência. O dia atual, enquanto estiver pendente, não interrompe a sequência.

**Sequência geral:** conta os dias perfeitos, definidos como aqueles em que todos os hábitos ativos programados foram concluídos. Dias sem hábitos programados são neutros.

A janela máxima de cálculo de sequências é de 365 dias.

### Períodos e estatísticas

- `week`: sete dias, incluindo o dia atual.
- `month`: 30 dias, incluindo o dia atual.
- Intervalos personalizados: máximo de 366 dias.
- Somente hábitos ativos participam do dashboard, das estatísticas gerais e das análises por IA.
- O dashboard e o endpoint `/progress` compartilham a função `buildOverview`.

### Regras dos check-ins

- Um check-in por hábito por dia, garantido por índice único.
- Registros retroativos limitados aos últimos sete dias.
- Não são permitidos check-ins anteriores ao início do hábito.
- Não são permitidos check-ins em dias não programados.
- Hábitos arquivados não aceitam novos check-ins.

### Arquivamento e exclusão

- **Arquivar:** preserva o hábito e seu histórico.
- **Reativar:** permite que o hábito volte a participar das estatísticas conforme as regras da aplicação.
- **Excluir:** remove o hábito e seus check-ins em uma transação.
- **Limite:** 100 hábitos por usuário.

## Análise de hábitos com Groq

O endpoint `POST /ai/analyze` utiliza métricas calculadas no servidor para gerar uma análise de desempenho.

### Fluxo de processamento

1. Valida a sessão e o período solicitado.
2. Obtém os hábitos e os registros do usuário no banco de dados.
3. Calcula as métricas relevantes no servidor.
4. Envia ao provedor apenas métricas agregadas e nomes de hábitos saneados.
5. Valida a resposta recebida por meio de um schema.
6. Retorna o conteúdo validado como texto, sem executá-lo.

### Privacidade e segurança

- A chave `GROQ_API_KEY` permanece no servidor e é compartilhada com as demais funções que usam Groq.
- E-mail, nome do usuário e IDs pessoais não são enviados ao provedor conforme o fluxo documentado.
- Os nomes dos hábitos são tratados como dados não confiáveis e delimitados em `<dados>`, com caracteres `<` escapados.
- A resposta do provedor não é executada como código nem interpretada como instruções internas da aplicação.

### Limites e erros

- `AI_NOT_CONFIGURED`: chave de API não configurada.
- `INSUFFICIENT_DATA`: não existem hábitos programados suficientes no período.
- `AI_TIMEOUT`: o provedor excedeu o limite de tempo configurado.
- `AI_PROVIDER_ERROR`: falha na comunicação com o provedor.
- `AI_INVALID_RESPONSE`: resposta incompatível com o schema esperado.

A busca obtém edições e capas do Open Library e Google Books; o usuário escolhe a edição. Google Books funciona com a quota pública sem chave; `GOOGLE_BOOKS_API_KEY` é opcional para quota própria. Se `GROQ_API_KEY` estiver configurada, Groq sugere uma correspondência. Chaves são mantidas exclusivamente no servidor. As consultas são limitadas por usuário por `RATE_LIMIT_ISBN_LOOKUP_PER_HOUR`; as sugestões de ISBN precisam ser válidas e constar entre os resultados dos catálogos.

Quando não há chave de API, a API retorna `503 AI_NOT_CONFIGURED`. Quando não há hábitos programados no período, retorna `422 INSUFFICIENT_DATA` sem chamar o provedor.

O limite de utilização é configurado por `RATE_LIMIT_AI_PER_HOUR`, por usuário. O timeout e o modelo são configurados por `GROQ_TIMEOUT_MS` e `GROQ_MODEL`.

Nenhuma análise é simulada quando o serviço não está configurado.

## Códigos de erro

| Código | Significado |
|---|---|
| `VALIDATION_ERROR` | Dados de entrada inválidos. |
| `INVALID_JSON` | Corpo JSON malformado. |
| `PAYLOAD_TOO_LARGE` | Corpo da requisição excede o limite permitido. |
| `UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `INVALID_TOKEN` | Token rejeitado. |
| `INVALID_CREDENTIALS` | Credenciais inválidas. |
| `EMAIL_IN_USE` | E-mail já cadastrado. |
| `CSRF_*` | Falha em uma verificação de proteção CSRF. |
| `HABIT_NOT_FOUND` | Hábito inexistente ou inacessível ao usuário. |
| `CHECKIN_NOT_FOUND` | Check-in inexistente ou inacessível. |
| `CHECKIN_ALREADY_EXISTS` | Já existe um check-in para o hábito e a data. |
| `HABIT_ARCHIVED` | Hábito arquivado não aceita check-ins. |
| `NOT_SCHEDULED` | Hábito não programado para a data. |
| `FUTURE_DATE` | Data futura não permitida. |
| `DATE_TOO_OLD` | Data anterior à janela retroativa permitida. |
| `BEFORE_HABIT_START` | Data anterior ao início do hábito. |
| `INVALID_RANGE` | Intervalo de datas inválido. |
| `RANGE_TOO_LARGE` | Intervalo excede o limite permitido. |
| `HABIT_LIMIT_REACHED` | Limite de hábitos atingido. |
| `RATE_LIMITED` | Limite de requisições atingido. |
| `GROQ_NOT_CONFIGURED` | Chave do Groq ausente para classificar a categoria do hábito. |
| `GROQ_CATEGORY_TIMEOUT` | Tempo limite da classificação de categoria excedido. |
| `GROQ_CATEGORY_ERROR` | Erro ao consultar o Groq para classificar o hábito. |
| `GROQ_INVALID_CATEGORY` | Resposta de categoria inválida do Groq. |
| `AI_NOT_CONFIGURED` | Provedor de IA não configurado. |
| `INSUFFICIENT_DATA` | Dados insuficientes para análise. |
| `AI_TIMEOUT` | Tempo limite do provedor excedido. |
| `AI_PROVIDER_ERROR` | Erro no provedor de IA. |
| `AI_INVALID_RESPONSE` | Resposta da IA inválida. |

Os códigos específicos de autenticação, validação e IA devem ser interpretados em conjunto com o status HTTP e a mensagem retornada.

## Estrutura do projeto

```text
focuser-api/
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/
│   ├── routes/
│   ├── controllers/
│   ├── services/
│   ├── middlewares/
│   ├── validators/
│   ├── utils/
│   ├── app.js
│   └── server.js
├── tests/
│   ├── unit/
│   └── integration/
├── .env.example
├── SECURITY_AUDIT.md
└── package.json
```

A organização separa rotas, controladores, regras de negócio, validações, middlewares e acesso aos dados, facilitando a manutenção e a evolução da API.

## Segurança

Consulte [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) para conhecer os testes, as verificações e as considerações de segurança documentadas para o projeto.

Antes de disponibilizar a API em produção, valide as configurações de ambiente, os controles de autenticação, as permissões do banco, o HTTPS, o CORS e os limites de requisições.

---

**Focuser API V1**  
Backend de hábitos e produtividade, com foco em consistência, privacidade e segurança.
