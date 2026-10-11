# Deployment Strategy

## Architecture
- **Database**: Supabase (PostgreSQL) - Free Tier.
- **Hosting**: Railway.app or Render.com (Auto-deploy from GitHub).
- **Frontend**: Next.js + Tailwind CSS (Admin Dashboard - Planned).

## Environments
| Environment | Branch | Purpose | Database |
|-------------|--------|---------|----------|
| **Pre-Prod** | `develop` | Beta testing & Validation | `db-wow-dev` |
| **Prod** | `main` | Production | `db-wow-prod` |

## CI/CD Pipeline
- **GitHub Actions**: 
  - Run `scripts/verify-core.ts` on every PR to `main`.
  - Block merge if integration tests fail.
