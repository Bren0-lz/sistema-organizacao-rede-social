# 🎬 Estúdio — Organizador de Conteúdo

Sistema de organização de postagens para criadores: vídeos crus, vídeos editados, capas e o
status de publicação em **Instagram, TikTok e YouTube**, com todos os arquivos guardados no
**Google Drive** (upload direto pelo site) e metadados num `db.json` na própria pasta do Drive —
zero backend.

## Funcionalidades

- 📤 Upload de vídeos crus, editados e capas direto para o Drive (resumável, com barra de progresso)
- 🖼️ Capa vinculada estruturalmente a cada vídeo — sempre visível no card
- 📌 Atribuição de cada conteúdo a Instagram, TikTok e/ou YouTube
- 📅 Status por rede: **sem programação → programado (com data) → postado (com data e link)**
- 🗂️ Painel em colunas: Crus / Editados / Sem programação / Programados / Postados, com filtro por rede
- 👥 Suporte a equipe via pasta compartilhada do Drive
- 🔮 Preparado para automação futura de postagem (as APIs das 3 redes exigem auditoria/aprovação — ver plano)

## Stack

React 19 + TypeScript + Vite · Zustand · Framer Motion · Google Drive API (escopo `drive.file`) · Netlify

## Como rodar

Veja o passo a passo completo (Google Cloud, OAuth, Netlify, equipe) em **[SETUP.md](SETUP.md)**.

```bash
npm install
cp .env.example .env.local   # preencha o VITE_GOOGLE_CLIENT_ID
npm run dev
```

## Estrutura criada no Drive

```
📁 Organizador de Conteúdo/
  ├── db.json            ← banco de metadados (versão + itens)
  ├── 📁 Vídeos Crus/
  ├── 📁 Vídeos Editados/
  └── 📁 Capas/
```
