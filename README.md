# Job Networking App

A single place to track networking contacts: who you've reached out to, how, whether they replied, and context about each person.

**Phase 1: Contacts database**
- Add, edit, and delete contacts: name, job title, company, location, LinkedIn, personal and work emails (each marked not checked, verified, or bounced, plus a preferred email), phone, referred by, event met at, notes, and tags
- Outreach and reply history for each contact (date, method, note). "Contacted" and "Replied" are worked out from this history.
- Search, filter (contacted, replied, waiting for reply, tag), and sort
- CSV export of contacts and of the full history

## How it's built

- Plain HTML, CSS, and JavaScript, with no build step, served by GitHub Pages
- [Supabase](https://supabase.com) handles sign-in (email and password) and the database. Run `supabase/schema.sql` once in the Supabase SQL editor.
- Put the project URL and publishable key in `config.js`
- Open `?demo` for sample data that's stored only in the browser
