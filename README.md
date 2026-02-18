# Oliver JW Website

Personal website built with Next.js, including a Projects section and an earnings tracker app.

## Live Site
- https://oliverjw.me

## Features
- Personal pages (projects, writings, media, reading lists)
- Earnings tracker widget under Projects
- Earnings email workflow (Resend + Vercel cron)
- Press release + transcript discovery and LLM summaries

## Tech Stack
- Next.js
- TypeScript
- Vercel
- Resend
- Upstash Redis
- OpenAI API

## Local Setup
1. Clone repo
2. Install dependencies
3. Add environment variables
4. Run dev server

```bash
npm install
npm run dev
```

## Environment Variables
Create `.env.local`:

```env
OPENAI_API_KEY=your_key_here
RESEND_API_KEY=your_key_here
UPSTASH_REDIS_REST_URL=your_url_here
UPSTASH_REDIS_REST_TOKEN=your_token_here
CRON_SECRET=your_secret_here
```

## Testing
```bash
npm test
```

## Notes
- Do not commit secrets (`.env.local` is gitignored).
- This project is actively being improved.
