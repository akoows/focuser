# Testes de regressão do backend

Execute a partir de `api/` com Node.js 22 ou superior e as dependências instaladas:

```powershell
npm.cmd run test:regression
npm.cmd test
```

A suíte usa `node:test` e `node:assert/strict`, sem banco real, credenciais reais ou chamadas aos provedores externos. Prisma, fetch, relógio e agendadores são substituídos nos cenários pertinentes, com restauração após cada teste. Execute sem concorrência para isolar alterações temporárias de ambiente e caches de módulo.

| Arquivo | Cobertura |
| --- | --- |
| user-services.test.js | Os seis serviços de usuário; bcrypt real com custo reduzido; campos inválidos; persistência e sanitização; falhas do banco; claims JWT e revogação por tokenVersion. |
| habits-ai.test.js | Contagens, duplicatas, metas 1/20, overflow, agenda e streaks; respostas Groq válidas/inválidas; JSON, Zod, HTTP, timeout, abort e rede. |
| gym-workout.test.js | Epley, médias, volume, máximos e séries inválidas; estados terminais; tradução/fallback, imagens confiáveis, TTL de 24h/30m, deduplicação e concorrência máxima de quatro consultas. |
| reading-social.test.js | ISBN, título/autor, acentos, HTTPS e hosts confiáveis; filtro ACCEPTED/self no banco; envio, configuração e falhas Resend. |
| removed-feature.test.js | Endpoints retirados retornam 404; leitura preserva autenticação e metas preservam CSRF; cliente Prisma sem o modelo removido. |
| utils-validators.test.js | Datas, semanas, timezone; envelopes e ocultação de erros; todos os schemas exportados com fixtures válidas, tipos inválidos e campos extras; paginação; limites por IP e usuário. |

Resultado em 24/10/2026: regressão com 162 aprovações e 1 falha; unitários com 63 aprovações e 1 falha. Ambas as falhas já existiam na validação de metas de hábitos.

## Contratos e limites

- A categorização de hábitos não tem fallback local: ausência de configuração ou falha do Groq gera erro explícito. O fallback de tradução de exercícios usa o nome original.
- Os seis serviços legados de usuário não incrementam tokenVersion. Os testes verificam a claim e a rejeição de uma versão revogada pela autenticação; não presumem incremento nesses serviços.
- Nomes de exercícios são tratados como dados de consulta em uma origem fixa; URLs de imagem inseguras são rejeitadas. O serviço não possui uma lista de nomes proibidos. Os validadores limitam comprimento, lista e campos aceitos.
- O isolamento do feed é verificado na consulta ao banco (`status: ACCEPTED` e IDs permitidos). Os mocks não substituem testes de integração do banco.
- Os cenários de provedores exercitam contratos HTTP simulados; não verificam disponibilidade externa ou credenciais em produção.
