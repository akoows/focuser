# Focuser Web

Frontend React + Vite do Focuser. A API fica no diretório [`../api`](../api).

## Executar localmente

1. Configure e inicie a API seguindo as instruções em [`../api/README.md`](../api/README.md). No `.env` da API, permita as origens locais do site em `CORS_ORIGINS`:

   ```dotenv
   CORS_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
   ```

   Preserve quaisquer outras origens que já sejam necessárias.
2. Crie `.env` a partir de `.env.example` neste diretório. Ajuste `VITE_API_URL` somente se a API não estiver em `http://localhost:3000/api`.
3. Instale as dependências e inicie o frontend:

   ```sh
   npm install
   npm run dev
   ```

O Vite serve o site em `http://localhost:4173` e aceita conexões da rede local. Para abrir o site em outro dispositivo, use o IP da máquina que executa o frontend; por padrão, o frontend procura a API no mesmo hostname pela porta `3000`. `VITE_API_URL` pode sobrescrever esse endereço.

O frontend usa cookies de sessão `httpOnly` (`credentials: include`). As requisições que alteram dados enviam `X-Focuser-Client: web`; o JWT não é armazenado no navegador.

## Recursos integrados

- Cadastro, login, confirmação por e-mail e sessão persistida via `/auth/me`.
- Dashboard, hábitos, check-ins, progresso, histórico, metas e timer de foco.
- Perfis públicos, edição de perfil, amizades e configurações da conta.
- Biblioteca de leituras, busca de capas/edições e modo de foco de leitura.
- Categorias e análises de hábitos com Groq.

Este diretório contém somente o frontend React/Vite. A API Express, os testes da API e o schema Prisma ficam no diretório [`../api`](../api).

## Validar

```sh
npm run lint
npm run build
```
