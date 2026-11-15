# Callzo Engineering Assessment

This repository contains the complete submission for the **Software Engineer Intern** role at Callzo, organized into two independent, production-ready tasks:

- **[Task 1: Backend Usage Metering Service (`server/`)](file:///d:/Company%20based%20Assignments/CallZu%20Assignment/server/README.md)**
- **[Task 2: Usage Admin Console UI (`client/`)](file:///d:/Company%20based%20Assignments/CallZu%20Assignment/client/README.md)**

---

## 📁 Repository Structure

```
.
├── server/                 # Task 1: Backend Metering Service
│   ├── prisma/             # Schema, migrations, and seed script
│   ├── src/                # Express API, services, controllers, workers
│   ├── tests/              # Unit test suites (node:test)
│   ├── scripts/            # Integration simulator & reconciliation CLI
│   ├── Dockerfile          # Multi-stage Docker build
│   ├── docker-compose.yml  # Postgres, API, Worker, Simulator
│   └── README.md           # Architecture, cap design & trade-offs
│
├── client/                 # Task 2: Usage Admin Console UI
│   ├── public/             # Static icons and assets
│   ├── src/                # React components, pages, services, styling
│   ├── frontend-server.js  # Node.js production server & API proxy
│   ├── Dockerfile          # Multi-stage Docker build
│   ├── docker-compose.yml  # React Frontend & Mock API
│   └── README.md           # State architecture & trade-off notes
│
└── README.md               # Repository overview (this file)
```

---

## 🚀 Running the Projects

Both projects run with a single command via Docker Compose.

### Task 1: Backend Metering Service
```bash
cd server
docker compose up
```
The provided webhook simulator image is ARM64-only. On an AMD64/x86-64
Docker host, enable ARM64 emulation once before starting the stack:
```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker run --rm --platform linux/arm64 alpine uname -m
```
The verification command should output `aarch64`. The API and database images
run natively on AMD64; only the simulator requires emulation.

Starts:
- **PostgreSQL 17** (`callzo-db`) on port `5432`
- **Database Migrations** (`callzo-migrate`)
- **Database Seeding** (`callzo-seed`)
- **Express API Server** (`callzo-api`) on port `3000`
- **Background Retry Worker** (`callzo-worker`)
- **Webhook Telephony Simulator** (`callzo-simulator`) testing all scenarios against the API

Health check:
```bash
curl http://localhost:3000/health
```

To run the repository integration scenarios against the running API and the
same Docker PostgreSQL database:
```bash
docker compose exec api node scripts/simulate.js
```

### Task 2: Usage Admin Console UI
```bash
cd client
docker compose up
```
The provided mock API image is ARM64-only, while the submitted frontend image
is AMD64-only. On an AMD64/x86-64 Docker host, enable ARM64 emulation once
before starting the stack:
```bash
docker run --privileged --rm tonistiigi/binfmt --install arm64
docker run --rm --platform linux/arm64 alpine uname -m
```
The verification command should output `aarch64`. The frontend runs natively
on AMD64; only the mock API requires emulation.

Starts:
- **Mock Telephony API** (`mock-api`) on port `8001`
- **React Admin Console** (`callzo-frontend`) on port `3000`

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Testing

### Task 1 Unit Tests
```bash
cd server
npm test
```
All 9 unit tests pass verifying usage allocation, monthly cap boundary proration, and event validation.

### Task 2 Lint & Build
```bash
cd client
npm run lint
npm run build
```
0 ESLint errors/warnings; clean Vite production build.
