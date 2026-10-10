<p align="center">
  <img src="https://img.shields.io/badge/MARKIFY-Biometric_Attendance_Studio-c3f400?style=for-the-badge&labelColor=111319" alt="Markify" />
</p>

<h3 align="center">Facial Recognition Attendance System</h3>

<p align="center">
  Real-time face detection · Client-side biometric matching · Multi-location tracking · Cryptographic hash-chain verification
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=nextdotjs" />
  <img src="https://img.shields.io/badge/Supabase-Auth_%26_DB-3FCF8E?logo=supabase&logoColor=white" />
  <img src="https://img.shields.io/badge/face--api.js-ML-FF6F00?logo=tensorflow&logoColor=white" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
</p>

---

## Overview

**Markify** is a web-based biometric attendance management system that uses real-time facial recognition to automate student attendance. Built for educational institutions, it runs entirely in the browser — no external ML servers required. Each attendance record is cryptographically hashed into an immutable chain, ensuring tamper-proof audit trails.

## Key Features

| Feature | Description |
|---|---|
| **Live Face Detection** | Real-time webcam capture with `face-api.js` running SSD MobileNet + 128-D face descriptor matching, entirely client-side |
| **Student Enrollment** | Capture and store facial embeddings during enrollment with live preview and confidence scoring |
| **Multi-Location Tracking** | Tag sessions to physical locations (Classroom, Canteen, Library, Auditorium) — any laptop acts as a camera station |
| **Hash-Chain Ledger** | Every attendance record is SHA-256 hashed and chained to the previous record for tamper-proof verification |
| **Analytics Dashboard** | Attendance trends, per-student breakdowns, location heatmaps, and anomaly detection with interactive charts |
| **Session Management** | Create, monitor, and close attendance sessions with real-time participant counts |
| **Secure Auth** | Supabase Auth with email/password, email confirmation, and Row Level Security on all tables |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Browser (Client)                  │
│                                                      │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Webcam   │→ │ face-api.js  │→ │ 128-D Vector  │  │
│  │ Capture  │  │ SSD MobileNet│  │ Matching      │  │
│  └──────────┘  └──────────────┘  └───────┬───────┘  │
│                                          │           │
│  ┌───────────────────────────────────────┘           │
│  │  SHA-256 Hash Chain ← prev_hash                   │
│  └──────────────┬────────────────────────────────┐   │
│                 ▼                                │   │
│  ┌──────────────────────┐  ┌─────────────────┐   │   │
│  │ Next.js 14 App Router│  │ Recharts        │   │   │
│  │ (React Server/Client)│  │ Analytics       │   │   │
│  └──────────┬───────────┘  └─────────────────┘   │   │
└─────────────┼────────────────────────────────────┘   │
              │ Supabase Client SDK                     │
              ▼                                         │
┌─────────────────────────────────────────────────────┐
│                 Supabase (Backend)                    │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ PostgreSQL │  │ Auth       │  │ Row Level     │  │
│  │ Database   │  │ (Email/PW) │  │ Security      │  │
│  └────────────┘  └────────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Tech Stack

- **Framework** — Next.js 14 (App Router, React 18)
- **Language** — TypeScript 5
- **Styling** — Tailwind CSS 3.4 with custom design tokens
- **Database & Auth** — Supabase (PostgreSQL + Auth + RLS)
- **Face Recognition** — face-api.js (TensorFlow.js, runs client-side)
- **Charts** — Recharts
- **Fonts** — Space Grotesk, JetBrains Mono, Geist

## Database Schema

```sql
students (id, name, roll_no, embedding[], created_at)
sessions (id, class_name, location, created_by, created_at)
attendance (id, student_id, session_id, timestamp, confidence, status, hash, prev_hash)
```

- `location` — enum: `classroom | canteen | library | auditorium`
- `status` — enum: `present | flagged_duplicate | manual_override | manual_fallback`
- All tables protected by Row Level Security (authenticated users only)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### 1. Clone & Install

```bash
git clone https://github.com/Someone001/Markify.git
cd Markify
npm install
```

### 2. Configure Environment

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Set Up Database

Run the schema in your Supabase SQL Editor:

```bash
# Copy contents of supabase/schema.sql into Supabase → SQL Editor → Run
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign up, enroll students, and start taking attendance.

## Project Structure

```
markify/
├── public/
│   ├── bg-video.mp4              # Background ambience video
│   └── models/                   # face-api.js model weights
├── src/
│   ├── app/
│   │   ├── login/                # Authentication page
│   │   ├── signup/               # Registration page
│   │   ├── auth/callback/        # OAuth/email confirmation callback
│   │   └── dashboard/
│   │       ├── page.tsx          # Dashboard overview (stats + recent sessions)
│   │       ├── session/          # Session creation + live capture
│   │       ├── enroll/           # Student enrollment with face capture
│   │       └── analytics/        # Attendance analytics + charts
│   ├── components/
│   │   ├── BackgroundVideo.tsx   # Looping ambient background
│   │   ├── DotCursor.tsx         # Interactive cursor trail effect
│   │   ├── SidebarNav.tsx        # Dashboard navigation
│   │   └── LogoutButton.tsx      # Auth logout handler
│   ├── lib/
│   │   ├── supabase/             # Supabase client + server helpers
│   │   └── faceRecognition.ts    # face-api.js wrapper + matching logic
│   └── styles/
│       └── tokens.css            # Design tokens + animations
├── supabase/
│   └── schema.sql                # Full database schema + migrations
└── next.config.mjs               # Next.js config with optimizations
```

## Multi-Location Setup

Markify supports distributed attendance capture across multiple physical locations:

1. **Create a session** and select a location (Classroom, Canteen, Library, or Auditorium)
2. **Open the session** on any laptop with a webcam — each device runs its own independent face detection
3. **All devices log to the same database** — attendance records inherit the session's location tag
4. **Analytics** break down each student's attendance by location

> No cross-device sync is needed. Each laptop is a standalone camera station.

## Team

**3 Idiots** — Built as an academic project

---

<p align="center">
  <sub>Built with Next.js · Supabase · face-api.js · TailwindCSS</sub>
</p>
