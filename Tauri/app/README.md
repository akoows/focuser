# Focuser para desktop

O aplicativo Tauri usa a interface React da branch `web` para login/cadastro e
as áreas autenticadas de hoje, hábitos, metas, leituras, análises e configurações.
A página inicial pública do site não é exibida no desktop; o app abre no login.
A navegação usa hash routes para funcionar no WebView desktop.

## Executar

1. Inicie a API e o MongoDB na raiz do repositório. Cadastro e login não exigem
   verificação por e-mail. Veja as [instruções da API](../../README.md).
2. Instale as dependências do frontend:

   ```sh
   npm install
   ```

3. Inicie o aplicativo desktop:

   ```sh
   npm run tauri dev
   ```

Para executar no Android conectado à mesma rede Wi-Fi, use:

```sh
npm run android:dev
```

O comando fixa o host de desenvolvimento no IP Wi-Fi `192.168.15.14` deste PC,
evitando que o Tauri escolha o endereço de outra interface de rede. Se o IP do
PC mudar, atualize o endereço no script `android:dev` em `package.json`.

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
