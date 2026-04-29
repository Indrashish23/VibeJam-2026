# Bug report Google Form (2 questions)

Create a form at [Google Forms](https://forms.google.com) with **exactly these two questions** (order matters if you use prefill):

## Question 1 — Short answer

- **Title:** `What went wrong?`
- **Type:** Short answer  
- **Required:** Yes  

Players describe the bug here after the game opens the form.

## Question 2 — Paragraph (auto-filled by the game)

- **Title:** `Context (filled in by the game)`  
- **Type:** Paragraph  
- **Required:** No  

The build can prefill this with URL, time, map, mode, etc. To enable prefill:

1. In the form editor: **⋮** (three dots) → **Get pre-filled link** (or **Send** → link icon).
2. Put any sample text in the **Context** field and click **Get link**.
3. The URL will look like:
   `https://docs.google.com/forms/d/e/FORM_ID/viewform?usp=pp_url&entry.1234567890=sample`
4. Copy the part that looks like `entry.1234567890` (numbers differ per form).
5. Add to your `.env`:
   ```env
   VITE_BUG_REPORT_FORM_URL=https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform
   VITE_BUG_FORM_ENTRY_CONTEXT=entry.1234567890
   ```
   Use the **same** `viewform` base URL (without `?usp=...` and without other `entry.` params) for `VITE_BUG_REPORT_FORM_URL`.

If you skip `VITE_BUG_FORM_ENTRY_CONTEXT`, the form still opens; only the context field won’t be prefilled.

## Vercel / production

Add the same env vars in the project’s **Environment Variables** and redeploy.
