# Luby Music Vercel integration checkpoint

This branch preserves the current public course-registration homepage and adds
the guitar-care customer and admin routes without changing the GitHub Pages
`main` branch.

Planned production routes:

- `/` — existing course registration homepage
- `/guitar-care/` — guitar-care booking form
- `/admin/` — guitar-care administration

Production deployment backup:

- Deployment ID: `dpl_AovQZrTDGBv4Da8uekeiam2W34Wh`
- Rollback candidate: yes
- Build contained 17 files, including `api/register.js`

The existing `api/register.js` source has been recovered and included. Do not
promote this branch to Production until the full registration flow has passed
on a Preview deployment.
