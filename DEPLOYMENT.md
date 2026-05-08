Deploy backend on Render and frontend on Vercel

1. Backend deploy to Render

- Open Render and create a new Blueprint service from this GitHub repository.
- Render will detect render.yaml at repository root.
- Service rootDir is backend, buildCommand is npm install, startCommand is npm start.
- Set backend environment variables in Render:
  - DB_HOST
  - DB_PORT=4000
  - DB_NAME
  - DB_USER
  - DB_PASSWORD
  - DB_SSL=true
  - DB_SSL_REJECT_UNAUTHORIZED=true
  - FRONTEND_ORIGIN=https://your-vercel-domain.vercel.app
  - FRONTEND_ORIGIN_REGEX=^https://.*\\.vercel\\.app$
- Deploy and verify health endpoint:
  - https://your-render-service.onrender.com/api/health

2. Frontend deploy to Vercel

- Import the same repository into Vercel.
- Set Root Directory to frontend.
- Framework preset should be Next.js.
- Add environment variable:
  - NEXT_PUBLIC_API_BASE_URL=https://your-render-service.onrender.com
- Deploy.

3. Connect frontend and backend

- After Vercel creates a production domain, copy it into Render FRONTEND_ORIGIN.
- If you use preview deploys on Vercel, keep FRONTEND_ORIGIN_REGEX enabled.
- Redeploy backend after changing env vars.

4. Common checks

- If login or API calls fail in browser with CORS error:
  - Make sure Render FRONTEND_ORIGIN has your exact Vercel production domain.
  - Keep FRONTEND_ORIGIN_REGEX for preview domains.
- If backend cannot connect DB:
  - Verify TiDB user/password and IP allowlist.
