# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability in RealSync, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email the team directly:

- **Ahmed Sarhan** — [ahmed@realsync.ai](mailto:ahmed@realsync.ai)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Security Measures

RealSync implements the following security practices:

- **Authentication**: Supabase Auth with JWT tokens, OAuth 2.0 (Google, Microsoft)
- **Authorization**: Row-level security (RLS) on all Supabase tables
- **Data in Transit**: TLS encryption on all endpoints via Cloudflare
- **API Security**: Bearer token authentication, CORS origin whitelisting, rate limiting
- **AI Pipeline**: Isolated GPU inference service with API key authentication
- **Session Data**: Encrypted at rest in Supabase (AES-256), auto-purged after retention period
- **No PII Storage**: Video frames are analyzed in real-time and never stored

## Scope

This security policy covers:
- The RealSync web application (real-sync.app)
- The backend API (api.real-sync.app)
- The AI inference service

Out of scope:
- Third-party services (Supabase, Cloudflare, Zoom)
- Social engineering attacks
- Denial of service attacks
