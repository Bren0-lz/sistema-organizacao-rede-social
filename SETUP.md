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

## Solução de problemas

- **"VITE_GOOGLE_CLIENT_ID não configurado"** → faltou o `.env.local` (local) ou a variável de ambiente (Netlify; refaça o deploy após criar a variável).
- **Erro 403 `access_denied` no login** → o e-mail não está em Test users.
- **Popup do Google bloqueado** → permita popups para o domínio do app.
- **Membro da equipe não vê os conteúdos** → confira se a pasta foi compartilhada como Editor e se ele colou o link da pasta nas Configurações.
