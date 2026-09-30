# HR Outreach Manager

Next.js app for importing HR contacts, tracking outreach, and sending email.

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` before using Supabase or direct email.

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
3. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` from Supabase project settings.
4. Keep the service role key server-only. Do not rename it with a `NEXT_PUBLIC_` prefix.
5. Add SMTP values if you want **Send Direct** to send mail. For Gmail, use an App Password.

Without Supabase credentials, the app falls back to browser storage for local development.

## Deploy on Vercel

Import this repository into [Vercel](https://vercel.com/new), select the project root, and use the default Next.js build settings. Add these environment variables under **Settings > Environment Variables**:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Redeploy after adding or changing environment variables.
