# Focuser Web

Aplicação React + Vite para o Focuser API V1.

## Executar localmente

1. Inicie a API em `../focuser-api` e configure o MongoDB conforme o README da API. `GOOGLE_BOOKS_API_KEY` é opcional para a quota Google Books; Groq para sugerir edições também é opcional.
2. Inclua a origem do frontend na variável `CORS_ORIGINS` do arquivo `.env` da API:

   ```dotenv
   CORS_ORIGINS=http://localhost:4173,http://127.0.0.1:4173
   ```

   Preserve na lista quaisquer outras origens que já sejam necessárias.
3. Crie `.env` a partir de `.env.example` neste diretório e ajuste `VITE_API_URL` se a API não estiver em `http://localhost:3000/api`.
4. Instale e inicie o frontend:

   ```sh
   npm install
   npm run dev -- --host 0.0.0.0 --port 4173
   ```

O frontend usa cookies de sessão `httpOnly` (`credentials: include`). As requisições que alteram dados enviam `X-Focuser-Client: web`; não armazena JWT no navegador.

## Integração disponível

- Cadastro e login, sessão persistida via `/auth/me` e logout.
- Dashboard, lista e gerenciamento de hábitos, check-ins e progresso/histórico; categorias automáticas de hábitos definidas pelo Groq.
- Atualização de nome e fuso horário do perfil.
- Períodos de análise semanais e mensais.
- Metas conectadas à API, com criação, edição, progresso, arquivamento e exclusão.
- Timer conectado às sessões persistidas da API, com pausa, retomada, conclusão e vínculo opcional a uma meta.
- Leituras em uma aba própria, com cadastro de livros, escolha entre capas/edições encontradas no Open Library e Google Books, sugestão opcional de ISBN via Groq e sessões cronometradas ou livres. Durante o modo foco, o áudio ambiente pode ser escolhido em um menu flutuante; ao finalizar a sessão, a pessoa informa as páginas lidas para salvar o registro. O modo foco ocupa a tela, com o cronômetro central e controles na base, e tenta manter a tela ligada; o Não Perturbe precisa ser ativado manualmente nas configurações do aparelho.
- Cores de destaque predefinidas ou personalizadas nas configurações; a cor selecionada também colore a estrela da logo e fica salva no perfil do usuário.
- Todos os recursos disponíveis sem planos ou pagamentos.

Preferências de notificações e bloqueio ainda não possuem endpoints na API e permanecem fora desta integração.

## Validar

```sh
npm run lint
npm run build
```
