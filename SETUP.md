# SETUP — Configuração do Google Cloud e Netlify

Siga estes passos uma única vez para colocar o Estúdio no ar.

## 1. Google Cloud Console (Drive API + OAuth)

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `organizador-conteudo`).
2. Em **APIs e serviços → Biblioteca**, procure **Google Drive API** e clique em **Ativar**.
3. Em **APIs e serviços → Tela de permissão OAuth**:
   - Tipo de usuário: **Externo** → Criar.
   - Preencha nome do app (ex.: "Estúdio"), e-mail de suporte e e-mail do desenvolvedor. Salve.
   - **Público-alvo (Audience)**: mantenha em **Testing** (modo de teste) e adicione em
     **Test users** o seu e-mail e os e-mails de toda a equipe. Nesse modo não é preciso
     passar pela verificação da Google.
4. Em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - **Origens JavaScript autorizadas**:
     - `http://localhost:5173`
     - `https://SEU-SITE.netlify.app` (adicione depois que souber o domínio)
   - Não precisa de URI de redirecionamento (o app usa o fluxo de token do GIS).
   - Copie o **Client ID** gerado (termina com `.apps.googleusercontent.com`).

## 2. Rodar localmente

```bash
cp .env.example .env.local   # no Windows: copy .env.example .env.local
# edite .env.local e cole o Client ID
npm install
npm run dev
```

Abra <http://localhost:5173>, entre com sua conta Google e o app criará no seu Drive a pasta
**Organizador de Conteúdo** com as subpastas `Vídeos Crus`, `Vídeos Editados`, `Capas` e o
arquivo `db.json` (banco de metadados).

## 3. Deploy na Netlify

1. Suba o repositório para o GitHub e em <https://app.netlify.com/> use **Add new site → Import from Git**.
2. A Netlify lê o `netlify.toml` automaticamente (build `npm run build`, publish `dist`).
3. Em **Site configuration → Environment variables**, adicione:
   - `VITE_GOOGLE_CLIENT_ID` = seu Client ID.
4. Faça o deploy, copie o domínio final (ex.: `https://meu-estudio.netlify.app`) e **volte ao
   Google Cloud** para adicioná-lo nas Origens JavaScript autorizadas da credencial OAuth.

## 4. Trabalhar em equipe

1. Cada membro precisa estar na lista de **Test users** do Google Cloud (passo 1.3).
2. O dono abre **Configurações** no app → "Abrir pasta no Drive" → compartilha a pasta
   **Organizador de Conteúdo** com os e-mails do time (permissão **Editor**).
3. Cada membro entra no app com a própria conta Google, abre **Configurações** e cola o
   link da pasta compartilhada em "Conectar a uma pasta compartilhada".

## 5. Publicar no YouTube (conta diferente do Drive)

O Drive (banco de dados) e o YouTube usam conexões separadas, então você pode publicar
vídeos em um canal de uma conta Google **diferente** da conta usada para o Drive.

1. No Google Cloud, em **APIs e serviços → Biblioteca**, ative a **YouTube Data API v3**
   (no mesmo projeto do Drive ou em um projeto à parte — veja o passo 3 abaixo).
2. Para que a conta-alvo consiga autorizar a publicação, escolha **uma** das opções:
   - **Adicionar como Test user**: na **Tela de permissão OAuth** do projeto, inclua o
     e-mail da conta do YouTube em **Test users**. Use isto se o projeto OAuth padrão do
     app já serve.
   - **Client ID OAuth próprio para o YouTube**: se a conta-alvo pertence a outro projeto
     OAuth (ou a equipe quer publicar pelo próprio projeto), crie um **ID do cliente OAuth**
     tipo **Aplicativo da Web** (com as mesmas Origens JavaScript autorizadas do passo 1.4),
     copie o Client ID e cole no app em **Configurações → "Client ID do YouTube (OAuth)"**.
     Deixe esse campo **vazio** para publicar com o projeto padrão do app.
3. No app, abra **Configurações → Conta do YouTube → "Conectar YouTube"** e escolha a conta
   desejada na tela `select_account` do Google. Publicações, edições e exclusões no YouTube
   usam somente essa conta.

> O Client ID do YouTube fica salvo em `config.json` na pasta do app no Drive, então é
> compartilhado com a equipe. Ao salvar um novo Client ID o app invalida o token atual e
> exige reconectar a conta do YouTube.

## Solução de problemas

- **"VITE_GOOGLE_CLIENT_ID não configurado"** → faltou o `.env.local` (local) ou a variável de ambiente (Netlify; refaça o deploy após criar a variável).
- **Erro 403 `access_denied` ao conectar o YouTube** → o e-mail dessa conta não está em Test users do projeto OAuth usado, ou faltou ativar a YouTube Data API v3 (veja o passo 5).
- **Erro 403 `access_denied` no login** → o e-mail não está em Test users.
- **Popup do Google bloqueado** → permita popups para o domínio do app.
- **Membro da equipe não vê os conteúdos** → confira se a pasta foi compartilhada como Editor e se ele colou o link da pasta nas Configurações.
