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
  - `.github/workflows/ci.yml`: `tsc --noEmit`, tests and build on every PR.
  - Block merge if CI fails (branch protection).
