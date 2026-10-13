# Focuser para desktop

O aplicativo Tauri usa a interface React da branch `web`, incluindo as páginas
públicas e as áreas autenticadas de hoje, hábitos, metas, leituras, análises e
configurações. A navegação usa hash routes para funcionar no WebView desktop.

## Executar

1. Inicie a API e o MongoDB na raiz do repositório. Cadastro e login exigem
   `RESEND_API_KEY` e `EMAIL_FROM` no `.env` da raiz, pois usam verificação de
   e-mail e código de acesso. Veja as [instruções da API](../../README.md).
2. Instale as dependências do frontend:

   ```sh
   npm install
   ```

3. Inicie o aplicativo desktop:

   ```sh
   npm run tauri dev
   ```

Por padrão, o cliente usa `http://localhost:3000/api`. Para apontar para outra
instância, crie `Tauri/app/.env` com:

```dotenv
VITE_API_URL=http://localhost:3000/api
```

A API deve permitir a origem do WebView Tauri e habilitar credenciais de cookie.
O cliente usa `credentials: include` e envia `X-Focuser-Client: web` nas
requisições mutáveis.

## Validar

```sh
npm run build
```
