# StockScout

StockScout is a mobile-first Indian stock research MVP built with React, Vite,
Express, and Yahoo Finance chart data.

## Local development

Install dependencies:

```sh
npm install
```

Run the backend:

```sh
npm run server
```

Run the frontend:

```sh
npm run dev
```

The frontend reads the API URL from `VITE_API_BASE_URL`. If it is not set, it
uses the deployed Render backend.

## Deployment

- Frontend: Vercel
- Backend: Render
- API health: `/health`
- Stock endpoint: `/stock/:ticker`

## MVP direction

- Keep the first release focused on fast stock snapshots and watchlist behavior.
- Add user accounts only after the core research flow is useful.
- A practical mobile path is to ship this as a PWA first, then wrap it with
  Capacitor if app-store distribution becomes necessary.
