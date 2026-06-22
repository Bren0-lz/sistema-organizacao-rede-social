# Guia de App Review — Instagram (Meta) e TikTok

Passo a passo para registrar o app nas duas plataformas e passar pela revisão.
As páginas legais já estão prontas no projeto, em `public/legal/` — depois do deploy
no Netlify elas ficam públicas nestas URLs (troque `SEU-SITE` pelo seu domínio):

| Documento | URL pública |
|---|---|
| Política de Privacidade | `https://sistema-organizacao-rede-social.vercel.app/legal/privacidade.html` |
| Termos de Serviço | `https://sistema-organizacao-rede-social.vercel.app/legal/termos.html` |
| Exclusão de Dados | `https://sistema-organizacao-rede-social.vercel.app/legal/exclusao-de-dados.html` |

> Antes de cadastrar, faça o deploy e confirme que as 3 URLs abrem **sem login**
> (abra numa aba anônima). Os revisores não conseguem logar no app.

---

## Parte 1 — Meta (Instagram)

### Pré-requisitos
- Conta do Instagram convertida para **Profissional (Business ou Creator)**.
- Uma **Página do Facebook** vinculada a essa conta do Instagram.
- Conta no **Meta for Developers** (https://developers.facebook.com).

### Passos
1. **Criar o app:** Meta for Developers → *Meus Apps* → *Criar app* → caso de uso
   **"Outro"** → tipo **Empresa (Business)**.
2. **Configurações → Básico**, preencha:
   - **URL da Política de Privacidade:** `.../legal/privacidade.html`
   - **URL dos Termos de Serviço:** `.../legal/termos.html`
   - **URL de Instruções de Exclusão de Dados:** `.../legal/exclusao-de-dados.html`
     (campo "Data Deletion Instructions URL" / "Excluir dados").
   - **Categoria:** *Negócios e páginas* (ou *Produtividade*).
   - **E-mail de contato:** daniel.telecomb2b@gmail.com
   - **Ícone do app** (1024×1024).
3. **Adicionar produto:** *Instagram* → *API com login do Instagram* (Instagram Graph API
   / Content Publishing).
4. **Permissões necessárias** (em *Revisão do app → Permissões e recursos*):
   - `instagram_business_basic`
   - `instagram_business_content_publish`
   - `pages_show_list`
   - `business_management`
5. **Modo de Desenvolvimento (sem review):** adicione sua conta como
   *Função → Testadores/Administradores*. Nesse modo você já publica **nas suas próprias
   contas** sem passar pela revisão completa. Bom para validar tudo primeiro.
6. **Para uso fora do modo dev (App Review):** envie
   - **Screencast** mostrando: login → selecionar vídeo → publicar no Instagram.
   - Descrição de como cada permissão é usada.
   - Confirmação de que as URLs legais estão acessíveis.

### Observações técnicas (Content Publishing)
- A mídia precisa estar numa **URL pública** (`video_url` / `image_url`) — a Meta busca o
  arquivo. Não há upload binário direto como no YouTube.
- A API **publica na hora**; agendamento tem que ser feito por um processo seu (backend/cron).

---

## Parte 2 — TikTok

### Pré-requisitos
- Conta no **TikTok for Developers** (https://developers.tiktok.com).

### Passos
1. **Registrar o app:** *Manage apps* → *Connect an app*.
2. Em **Basic information**, preencha:
   - **Terms of Service URL:** `.../legal/termos.html`
   - **Privacy Policy URL:** `.../legal/privacidade.html`
   - **App icon**, nome e descrição.
3. **Adicionar produto:** *Content Posting API*.
   - Para publicar direto (não só rascunho) você precisa solicitar o escopo
     `video.publish`; sem auditoria, o app fica em **sandbox** e só posta como
     rascunho/privado na sua própria conta.
4. **Scopes:** `user.info.basic`, `video.upload`, `video.publish`.
5. **Audit/Review:** para sair do sandbox, submeta o app para auditoria com:
   - Descrição do caso de uso.
   - Demonstração (vídeo) do fluxo de publicação.
   - URLs legais acessíveis.
   - Cumprir os requisitos de **UX guidelines** do TikTok (ex.: tela de confirmação antes de postar).

### Observações técnicas
- Fluxo parecido: inicializar upload → enviar arquivo (ou via `PULL_FROM_URL`) → publicar.
- O usuário precisa confirmar a publicação (exigência de UX do TikTok).

---

## Checklist rápido

- [ ] Deploy feito; 3 URLs legais abrem sem login (aba anônima).
- [ ] Instagram convertido para conta Profissional + Página do FB vinculada.
- [ ] App Meta criado com as 3 URLs e permissões de content publish.
- [ ] Testado em modo dev publicando na própria conta.
- [ ] App TikTok criado com Terms + Privacy URLs e Content Posting API.
- [ ] Testado em sandbox (rascunho) na própria conta.
- [ ] (Opcional) Submetido para App Review / Audit para uso amplo.
