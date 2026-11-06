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
PC mudar, atualize o endereço no script `android:dev` em `package.json` e
adicione a origem `http://<IP-DO-PC>:1420` à variável `CORS_ORIGINS` da API.

Por padrão, o cliente usa `http://192.168.1.232:3000/api`. Para apontar para outra
instância, crie `Tauri/app/.env` com:

```dotenv
VITE_API_URL=http://192.168.1.232:3000/api
```

A API deve permitir a origem do WebView Tauri. No app Tauri, a sessão usa um
token Bearer armazenado localmente, adequado ao acesso à API por HTTP na rede
local; clientes web continuam usando o cookie HttpOnly. As requisições mutáveis
do app enviam `X-Focuser-Client: web` para compatibilidade com servidores
anteriores e `X-Focuser-Platform: tauri` para receber o token de sessão.

## Validar

```sh
npm run build
```
