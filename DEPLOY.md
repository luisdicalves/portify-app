# Portify — Deploy no Vercel (gratuito)

## 1. Instalar dependências

```bash
cd portfit-app
npm install
```

## 2. Configurar Supabase

1. Cria conta gratuita em [supabase.com](https://supabase.com)
2. Cria um novo projeto
3. Vai a **SQL Editor** e corre o ficheiro `supabase-schema.sql`
4. Em **Project Settings → API**, copia:
   - **Project URL**
   - **anon / public** key

## 3. Variáveis de ambiente (local)

Cria um ficheiro `.env.local` na pasta `portfit-app`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...
```

## 4. Testar localmente

```bash
npm run dev
# Abre http://localhost:3000
```

## 5. Publicar no Vercel

1. Faz push do projeto para GitHub (público ou privado)
2. Vai a [vercel.com](https://vercel.com) → **New Project**
3. Importa o repositório GitHub
4. Em **Environment Variables**, adiciona as mesmas variáveis do `.env.local`
5. Clica **Deploy** — fica online em ~1 minuto, grátis

## Estrutura

```
portfit-app/
├── app/
│   ├── auth/
│   │   ├── login/page.tsx       — Ecrã de login
│   │   ├── register/page.tsx    — Registo
│   │   ├── onboarding/page.tsx  — Onboarding (3 passos)
│   │   └── pin/page.tsx         — PIN de 6 dígitos
│   ├── dashboard/page.tsx       — Painel principal
│   ├── portfolio/page.tsx       — Portfólio + transações
│   ├── for-you/page.tsx         — Conteúdo personalizado
│   ├── activity/page.tsx        — Histórico de movimentos
│   └── profile/page.tsx         — Perfil + definições
├── components/ui/
│   └── BottomNav.tsx            — Navegação inferior
├── lib/
│   ├── context.tsx              — Tema + língua
│   ├── dict.ts                  — Traduções PT/EN
│   └── supabase/                — Cliente Supabase
├── supabase-schema.sql          — Schema da base de dados
└── .env.local.example           — Variáveis necessárias
```
