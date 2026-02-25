# Security Policy

## Supported Versions
Current default branch is supported for security updates.

## Reporting A Vulnerability
Do not open public issues for secrets, auth bypasses, or data-exfiltration risks.

Report privately to the repository owner with:
- Affected endpoint/file
- Reproduction steps
- Impact assessment
- Suggested mitigation

## Secret Handling Rules
- Secrets must come from environment variables only.
- Never commit `.env.local` or credential material.
- Rotate keys immediately if exposed.

## High-Risk Components
- Outbound email (`Resend`) credentials
- Cron/inbound auth secrets
- Redis state and lock keys
- OpenAI API credentials
