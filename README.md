# ShikshaOS

Open-source, self-hostable Education ERP + LMS for coaching academies and colleges.
Offline-resilient CBT exams, live classes, fees, report cards, and local AI via Ollama.

> Status: early development. See `docs/roadmap.md`.

## Quick start

    cp .env.example .env
    pnpm install
    pnpm infra:up
    pnpm db:migrate && pnpm db:seed
    pnpm dev

## License
AGPL-3.0
