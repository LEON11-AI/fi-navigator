# FI Navigator

FI Navigator is a lightweight FIRE planning MVP. It turns rough personal finance numbers into a confirmed snapshot, estimates a FIRE number and timeline, highlights the user's biggest blocker, and records beta or paid-roadmap interest.

## Current MVP Flow

1. User enters rough numbers in natural language.
2. `/api/parse` sends that text to Gemini and returns structured fields.
3. User confirms or edits the financial snapshot.
4. The app calculates FIRE number, progress, runway, cashflow freedom, and next money moves.
5. The result page collects free beta or paid roadmap waitlist intent.

Smart input is optional. If Gemini is unavailable, users can enter the snapshot manually.

## Local Setup

Prerequisites:

- Node.js 20+
- A Gemini API key for smart input

Install dependencies:

```bash
npm install
```

Create `.env.local`:

```bash
GEMINI_API_KEY="your_key_here"
APP_URL="http://localhost:3000"
```

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Data Handling

- Financial text is sent to Gemini only when the user uses smart input.
- Confirmed financial snapshots are saved in browser `localStorage`.
- Waitlist signup stores only email, optional first name, selected intent, timestamp, and user agent.
- Local waitlist records are appended to `data/subscribers.jsonl`, which is ignored by git.

## Scripts

```bash
npm run dev      # Start the Express + Vite dev server
npm run build    # Build frontend and bundled server
npm run start    # Run the production server bundle
npm run lint     # Type-check with TypeScript
```

## Product Notes

This app is for educational planning only. It should not recommend securities, funds, insurance, loans, or tax actions, and it should not present calculated outputs as financial advice.
