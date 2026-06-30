# Manzil Consultancy — Phase 1: Auth & RBAC Module

## Tech Stack
- **Backend**: Node.js + Express + TypeScript + Prisma + PostgreSQL
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + React Query

## Quick Start

### 1. Prerequisites
- Node.js 18+
- PostgreSQL running locally (or update DATABASE_URL)

### 2. Configure Environment
```bash
# Backend .env is pre-configured for local dev
# Update DATABASE_URL if your PostgreSQL credentials differ
```

### 3. Install & Setup
```bash
npm run install:all      # install all deps
npm run db:push          # push schema to DB (creates tables)
npm run db:seed          # seed roles, permissions, super admin
```

### 4. Run
```bash
# Terminal 1
npm run dev:backend      # API on http://localhost:5000

# Terminal 2
npm run dev:frontend     # UI on http://localhost:5173
```

### Default Super Admin
- **Email**: admin@manzil.com
- **Password**: Admin@123456

---

## Architecture

### RBAC Model
```
Users ──── UserRoles ──── Roles ──── RolePermissions ──── Permissions
```

### Built-in Roles
| Role | Description |
|------|-------------|
| SUPER_ADMIN | Full system access (all permissions) |
| ADMIN | User management, audit logs, reports |
| MANAGER | View users, create/view reports |
| USER | Dashboard access only |

### Permissions
`users:read` `users:write` `users:delete`  
`roles:read` `roles:write` `roles:delete`  
`permissions:read` `permissions:write`  
`audit:read` `dashboard:read`  
`reports:read` `reports:write`

---

## API Reference

### Auth Endpoints
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/register | — | Register new user |
| POST | /api/auth/login | — | Login (returns access token + sets refresh cookie) |
| POST | /api/auth/refresh | cookie | Rotate refresh token |
| POST | /api/auth/logout | Bearer | Revoke current refresh token |
| POST | /api/auth/logout-all | Bearer | Revoke all refresh tokens |
| POST | /api/auth/forgot-password | — | Request reset link |
| POST | /api/auth/reset-password | — | Reset with token |
| POST | /api/auth/change-password | Bearer | Change password |
| GET | /api/auth/me | Bearer | Get current user |

### User Endpoints
| Method | Path | Permission |
|--------|------|-----------|
| GET | /api/users | users:read |
| GET | /api/users/:id | self or admin |
| PUT | /api/users/:id | users:write |
| DELETE | /api/users/:id | users:delete |
| POST | /api/users/:id/roles | users:write |
| DELETE | /api/users/:id/roles/:roleId | users:write |

### Role Endpoints
| Method | Path | Permission |
|--------|------|-----------|
| GET | /api/roles | roles:read |
| POST | /api/roles | roles:write |
| GET | /api/roles/:id | roles:read |
| PUT | /api/roles/:id | roles:write |
| DELETE | /api/roles/:id | roles:delete |
| PUT | /api/roles/:id/permissions | permissions:write |
| GET | /api/roles/permissions | permissions:read |
| GET | /api/roles/audit-logs | audit:read |

---

## Security Features
- **JWT access tokens** (15min expiry, in-memory on frontend)
- **Refresh token rotation** (httpOnly cookie, 7-day expiry, revoked on use)
- **Account lockout** after 5 failed login attempts (30min)
- **Password policy**: 8+ chars, uppercase, lowercase, number, special char
- **Rate limiting**: 10 auth attempts / 15min, 5 reset requests / hour
- **Helmet** security headers (CSP, HSTS, etc.)
- **CORS** strict origin allowlist
- **Audit logging** for all auth events
- **Input validation** via Zod (backend + frontend)
- **SQL injection prevention** via Prisma parameterized queries
- **Bcrypt** password hashing (cost factor 12)
