# useQuery — SDE-2 Interview Challenge

**Stack:** Vite · React 18 · TypeScript  
**Time limit:** 45 minutes

---

## Getting started

```bash
npm install
npm run dev

or

pnpm install
pnpm run dev
```

Open http://localhost:5173 in your browser.

---

## Your task

Implement `useQuery(key, fetchFn)` inside **`src/hooks/useQuery.ts`**.

That is the **only file you should edit**.

---

## Verifying your solution

Click the **▶ Verify** button in the top bar.

All 8 test steps run in-browser and results appear live — no terminal needed.
Click any failing step to expand the assertion detail.

---

## Requirements

| Step | Title | What's tested |
|------|-------|---------------|
| 1 | Basic state lifecycle | `loading → data/error`, no setState after unmount |
| 2 | Cache by key | Same key returns instantly, no re-fetch |
| 3 | Stale-while-revalidate | Stale shown synchronously, background refetch updates |
| 4 | Request deduplication | 2–3 simultaneous mounts = exactly 1 request |
| 5 | Key change mid-lifecycle | Switching key triggers new fetch, old data not leaked |
| 6 | Error handling edge cases | Failed fetch skips cache, `inFlight` cleaned on reject, errors propagate |
| 7 | Race condition | Rapid key switch — last key wins, no stale overwrite |
| 8 | SWR robustness | Stale survives failed refetch, unstable `fetchFn` ref safe |

---

## Hints

- Use `[key]` as the **only** `useEffect` dependency — not `fetchFn`.
- Initialise state from cache: `useState(() => cache.get(key))`.
- Use `useRef` to guard `setState` after unmount.
- Check `inFlight` before calling `fetchFn` — attach `.then()` if already in-flight.
- Delete the `inFlight` entry in **both** `.then()` and `.catch()`.
- Never write to `cache` on a failed fetch.

---

## Project structure

```
src/
├── hooks/
│   └── useQuery.ts        ← EDIT THIS FILE ONLY
├── runner/
│   └── testRunner.ts      ← do not modify
├── utils/
│   └── mockApi.ts         ← do not modify
├── App.tsx                ← do not modify
└── main.tsx               ← do not modify
```

---

## Scoring rubric

| Steps passed | Signal |
|---|---|
| 1–2 / 8 | Basic React state understanding |
| 3–4 / 8 | Core requirement met |
| 5–6 / 8 | Solid SDE-2 level |
| 7–8 / 8 | Strong SDE-2 / approaching SDE-3 |
