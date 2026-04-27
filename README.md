# AI Lead Response Bot

Full-stack web application that captures leads, generates an AI-assisted response, and provides a broker dashboard.

## Stack

- Node.js + Express backend
- SQLite database
- Vanilla HTML/CSS/JS frontend
- Chart.js for dashboard charts
- Environment variables for API keys/secrets

## Project structure

```
/server
  index.js
  database.js
  routes/
    leads.js
    clients.js
  services/
    openai.js
    trialManager.js

/frontend
  form.html
  dashboard.html
  styles.css
  dashboard.js
```

## Run locally

1. `npm install`
2. Create a `.env` file
3. Add `OPENAI_API_KEY`
4. `npm start`

Run these commands from the `server/` folder. The server will start on `http://localhost:3000`.

## Setup

### 1) Install dependencies

From the `server` folder:

```bash
cd server
npm install
```

### 2) Configure environment variables

Create `server/.env` (you can copy from `server/.env.example`):

- **PORT**: server port (default `3000`)
- **OPENAI_API_KEY**: your OpenAI API key (optional; if missing, AI response uses a safe fallback message)
- **OPENAI_MODEL**: model for responses (default `gpt-4o-mini`)
- **JWT_SECRET**: secret used to sign dashboard auth tokens
- **TRIAL_DAYS**: free trial length in days (default `7`)
- **APPOINTMENT_LINK_DEFAULT**: default booking link for new clients (default `https://calendly.com/`)
- **SQLITE_PATH**: optional path to SQLite DB file (default `server/data.sqlite`)

### 3) Run the server

```bash
cd server
npm start
```

Then open:

- Lead form: `http://localhost:3000/form.html`
- Broker dashboard: `http://localhost:3000/dashboard.html`

## Seed demo data (optional)

This creates a demo client and example leads so the dashboard has data immediately.

```bash
cd server
npm run seed
```

The script prints the **demo clientId** you can paste into the dashboard, and you can also use:

`http://localhost:3000/form.html?clientId=<demoClientId>`

## How to use

### Create a client account (broker)

1. Open `dashboard.html`
2. Click **Register**
3. After registering, the dashboard shows your **Client API key** and your **Lead form link**

### Capture leads (public form)

Use the generated link:

`http://localhost:3000/form.html?apiKey=YOUR_CLIENT_API_KEY`

Submitting the form will:

- Store the lead in SQLite
- Attempt to generate an AI response using OpenAI
- Return the response + appointment link to display on the form

### Trial expiration system

The server enforces trials:

- If trial is expired, lead capture and dashboard endpoints return HTTP **402** (`trial expired`).
- Trial start is set at registration time (`trial_started_at`) and lasts `TRIAL_DAYS`.

## API (quick reference)

- `POST /api/clients/register` → `{ token, client }`
- `POST /api/clients/login` → `{ token, client }`
- `POST /api/leads/public` (body includes `apiKey`) → saves lead + returns AI response
- `GET /api/leads` (Bearer token) → list leads
- `GET /api/leads/stats` (Bearer token) → leads per day for Chart.js

