# MTA web app (`frontend/`)

React 19 · TypeScript · Vite · React Router. One single-page app with an area per role (`/patient`, `/doctor`, …).

```bash
npm install
npm run dev      # http://localhost:5173, proxies /api to the API on :8080
npm run build    # type-check + production build into dist/
```

`VITE_HOME_URL` (see `.env.example`) sets the public website signed-out visitors are sent to.

- Structure, routing, data loading, i18n and styling: [frontend guide](../documentation/frontend.md).
- What each portal does: [patient](../documentation/patient-portal.md) · [doctor](../documentation/doctor-portal.md).
