graEDUFY — MERN + Clerk + Tailwind (multi-theme) + Stream Chat/Calls

Overview
- Tech stack: MongoDB, Express, React (Vite), Node.js
- Auth: Clerk (Sign in / Sign up, first-time onboarding)
- UI: Tailwind CSS with DaisyUI for multiple themes (light, dark, emerald)
- Realtime chat + calls: Stream (chat, video/voice calls)
- Community feed: Mongo-backed posts from you and your friends
- AI Chat: AI assistant (text + image input) with provider support (Gemini, OpenAI/Azure)

Monorepo Layout
- server: Express API (Clerk-protected), MongoDB via Mongoose
- client: Vite React app with Clerk, Tailwind (DaisyUI), Stream Chat/Video SDKs

Core Features
- Clerk Sign In / Sign Up, then onboarding on first login:
  - Collect: first name, last name, age, role (student or teacher — immutable), optional
  - Generate unique handle like @john123
- Sidebar sections: Profile, Feed, Friends (add by username, pending list), Chat (list, new chat, new group) and chat area
- Chat using Stream Chat; Call (voice/video) using Stream Video SDK
- Community feed: create a dynamic, AI-powered social feed that blends timeline posts, reactions, comments, and intelligent recommendations. Each post summarizes itself, highlights trending content, and shows personalized insights for the user, all in a clean, modern layout with smooth animations and real-time updates.
Requirements
- Node.js 18+
- MongoDB (local or Atlas)
- Clerk account (publishable key + secret key)
- Stream account (API key + secret) with Chat/Video enabled
- An AI provider key (Gemini or OpenAI/Azure)

Setup
1) Configure environment variables
   - Copy server/.env.example to server/.env and set values
   - Copy client/.env.example to client/.env and set values

2) Install dependencies
   - In server/: npm install
   - In client/: npm install

3) Run the apps
   - In server/: npm run dev (http://localhost:5001)
   - In client/: npm run dev (http://localhost:5173)

4) Clerk setup
   - In Clerk dashboard, set allowed redirect URLs to include:
     - http://localhost:5173
     - http://localhost:5173/sign-in
     - http://localhost:5173/sign-up
     - http://localhost:5173/onboarding
   - No JWT template required. The client uses Clerk session tokens via `getToken()`.
     - If you prefer custom JWT templates for other services, you can still create one and change the client calls to `getToken({ template: '<name>' })`.

5) Initial flow
   - Visit client at http://localhost:5173
   - Sign up / Sign in with Clerk
   - First login redirects to Onboarding
   - After onboarding, you land in the app (sidebar: Profile, Friends, Chat)

Notes
- Role can be set during onboarding and is immutable afterwards
- Handle (username) uniqueness is enforced by server; you can enter a preferred handle, the server will adjust with numeric suffix if needed
- Chat UI uses Stream components; a server endpoint issues user tokens for Stream
- Calls use Stream Video SDK with a separate token endpoint
- Feed posts live in MongoDB; the API supports real-time SSE updates, inline image/video attachments, likes, and threaded comments for you and the people you've friended.
 - AI Chat runs server-side and supports multiple providers. The client sends images as data URLs.
   - Gemini (default if `GEMINI_API_KEY` is set): set `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default `gemini-1.5-flash`).
   - OpenAI: set `OPENAI_API_KEY` and optional `OPENAI_MODEL` (default `gpt-4o-mini`). Optional `OPENAI_ORG_ID` and `OPENAI_BASE_URL`.
   - Azure OpenAI: set `OPENAI_PROVIDER=azure`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` (recommended) and optional `AZURE_OPENAI_API_VERSION`.
   - Force provider: set `AI_PROVIDER=gemini|openai|azure` (otherwise auto-detected by envs).

Environment variables
- server/.env
  - PORT: default 5001
  - MONGODB_URI: your Mongo connection string
  - CORS_ORIGIN: http://localhost:5173 (client URL)
  - CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY from Clerk dashboard
  - STREAM_API_KEY and STREAM_API_SECRET from Stream dashboard (chat + video)
  - AI_PROVIDER: gemini | openai | azure (optional)
  - GEMINI_API_KEY: from Google AI Studio (Gemini)
  - GEMINI_MODEL: optional; default gemini-1.5-flash
  - GEMINI_API_BASE / GEMINI_API_VERSION: optional
  - OPENAI_API_KEY: from OpenAI dashboard (if using OpenAI)
  - OPENAI_BASE_URL: optional; override base URL or proxy
  - OPENAI_ORG_ID: optional
- client/.env
  - VITE_CLERK_PUBLISHABLE_KEY: from Clerk
  - VITE_API_URL: http://localhost:5001
  - VITE_DEFAULT_THEME: light | dark | emerald
  - VITE_STREAM_API_KEY: Stream Chat/Video public key
