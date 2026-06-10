# Annotator — Essay Rhetorical-Move Tagging

A dark-themed (Instagram-style) web app for annotating TOEFL-like essays with rhetorical
moves: **Lead, Position, Claim, Counterclaim, Rebuttal, Evidence, Concluding Statement**.

- **Frontend**: React + Vite, deployed on GitHub Pages
- **Backend**: [Supabase](https://supabase.com) — Postgres + Auth + Row Level Security
- Every annotator gets their own account; annotations are private per user (admins see all)
- Span-level annotation with character offsets (select text, or tag whole paragraphs with ¶)
- Color-coded highlights synced with a side panel; submit/reopen per essay
- Admins manage labels (add custom ones, recolor), essays, and user roles
- Export to training-ready formats: nested JSON, JSONL spans (spaCy/doccano), CSV
  (Feedback-Prize style), CoNLL BIO, HuggingFace token-classification JSONL, and LLM
  chat-fine-tuning JSONL

## Setup

1. `npm install && npm run dev`
2. The app points at the Supabase project configured in `src/lib/supabase.js`
   (publishable key only — safe for browsers; all access is enforced by RLS).
3. First run: the app detects missing tables and shows a setup screen — copy the SQL
   (also in [`supabase/schema.sql`](supabase/schema.sql)) into the Supabase SQL Editor
   and run it. The script is idempotent.

## Database

| table | purpose |
| --- | --- |
| `profiles` | one per auth user, `role` = `admin` \| `annotator` |
| `labels` | annotation labels (seeded with the 7 rhetorical moves) |
| `essays` | title, prompt, full text |
| `annotations` | per-user spans: `start_offset`, `end_offset`, `label_id`, `note` |
| `essay_submissions` | marks an essay as submitted by a user |

RLS: annotators read/write only their own annotations; admins read everything for export;
only admins manage labels and roles (enforced by policies plus a role-change trigger).

## Deploy

```bash
npm run build          # outputs dist/ with relative asset paths
# push dist/ to the gh-pages branch (GitHub Pages serves it)
```
