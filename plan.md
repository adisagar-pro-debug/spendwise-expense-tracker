# Spendwise — Expense Tracker Dashboard Plan

## Product approach

Spendwise is a single-page, browser-only finance dashboard for importing and analyzing multiple bank statements. React, TypeScript, and Vite render one dashboard route; all parsing, classification, deduplication, filters, summaries, and exports run in the user's tab. No server, account connection, or transaction database is used. Statement files are discarded after parsing, transactions live in tab memory and clear on refresh/close, and only merchant/category corrections are retained in this browser's `localStorage`.

The import flow supports CSV, TSV, XLS, XLSX, and text-based PDF files up to 20 MB each; PDFs are limited to 200 pages per file. It parses locally, maps recognized columns, shows extracted rows and warnings before import, and does not invent missing transaction values. For PDFs with labeled date, narration, withdrawal, deposit, and balance columns, it uses column positions to separate debit/credit from the running balance. It associates all narration baselines inside the vertical band between adjacent dated transaction rows, preserving wrapped descriptions rather than selecting only the closest text fragment. A dated PDF amount is retained as an explicitly flagged “Unlabeled transaction” if no narration can be associated. It infers ambiguous date order from unambiguous dates in the statement and uses a labeled statement currency where present; the preview lets the user change date order. Other PDF layouts use the cautious line-based fallback and show extraction warnings. Ambiguous positive-only signs in other layouts can be set to spending or income in the preview. Spreadsheet files with multiple sheets report that only the first was used. Scanned/image-only PDFs are not supported; CSV exports are the most reliable source, and extracted rows should be reviewed against the statement.

Merchant rules and saved user corrections provide categorical suggestions. Merchants that remain unmatched stay Unknown until the user assigns a category in the import preview or ledger; there are no external Google Research links or automatic transmission of transaction details to a search provider. Duplicate candidates match on date, currency, normalized description/merchant, and amount; they are held out of totals initially, are reversible, and are recalculated if their source statement is removed. Currency totals remain separate; no exchange conversion is performed.

The transaction ledger paginates filtered results (25, 50, or 100 rows per page) to keep the rendered table bounded. Ledger text and primary controls use a larger, high-contrast type scale. The overview includes a Last month range, and the ledger remains available for all imported dates and searchable descriptions.

## Project structure

- `index.html` — document title, metadata, font links, favicon, and React entry point.
- `public/manus-routes.json` — the declared single dashboard route; `public/logo.svg` — the Spendwise site mark and favicon.
- `src/main.tsx` — React application bootstrap.
- `src/App.tsx` — workspace state, import commit, duplicate controls, analytics calculations, search/filters, pagination, pages, and CSV export.
- `src/components/Sidebar.tsx` — responsive navigation, workspace identity, and local privacy summary.
- `src/components/UploadDialog.tsx` — multi-file selection/drop, local parsing, categorized preview, ambiguous-sign/date controls, manual category correction, and import review.
- `src/components/TransactionsTable.tsx` — transaction rows, category editing, confidence, duplicate decisions, and extraction warnings.
- `src/components/StatCard.tsx` and `src/components/DashboardCharts.tsx` — finance summaries and lazily loaded cash-flow/category charts.
- `src/lib/importer.ts` — CSV, TSV, Excel and text-PDF extraction, normalized column mapping, amount/date parsing, wrapped-narration association, and review warnings.
- `src/lib/categories.ts` — explainable merchant rules, saved merchant/category overrides, normalization, and confidence labels.
- `src/lib/format.ts` and `src/lib/presentation.ts` — date/currency helpers, category colors, and CSV escaping.
- `src/data/demo-data.ts` — clearly labeled sample transactions and statements for exploring the dashboard before a real upload.
- `src/types.ts` — normalized statement, transaction, parser, and category types.

## Design direction

Three deliberately uncommon choices considered at the low-probability tail: Swiss Finance Ledger (0.061), Neo-Brutalist Money Lab (0.047), and Nordic Biophilic Finance (0.083). **Selected: Nordic Biophilic Finance.**

- **Design movement:** Nordic editorial banking, softened by restrained organic color and contemporary data journalism.
- **Core principles:** Numbers remain legible at a glance; classifications trace back to source rows; uncertain data is visibly provisional; the interface feels private and calm rather than gamified.
- **Color philosophy:** A deep forest-charcoal navigation rail creates a secure perimeter, paper-white surfaces keep records readable, and muted leaf green implies balanced money. Soft coral distinguishes outflows without warning-red alarm. The restrained mint accent makes primary action discoverable.
- **Layout paradigm:** A fixed vertical workspace rail supports an asymmetric canvas: an expansive cash-flow panel paired with a narrower category view, then a recent ledger and a focused review rail. The layout folds into stacked charts and bottom navigation on narrow screens.
- **Signature elements:** Mint-green geometric brand mark; paired green/coral cash-flow traces with a quiet shaded area; small confidence and source badges beside transaction descriptions.
- **Interaction philosophy:** Prefer reversible decisions, previews, clear provenance, and immediate feedback. Unknown means “not established yet,” not “probably X.” A manual choice is visible and reused on later imports.
- **Animation:** Use short opacity/translation transitions for dialogs, gentle card hover lift, and restrained loading/progress cues. Disable nonessential motion for `prefers-reduced-motion`; never animate finance values in a way that obscures exact amounts.
- **Typography system:** Manrope for large editorial headings and key money totals; DM Sans for controls and transaction rows; DM Mono for dates, counts, and compact numeric alignment.
- **Brand essence:** A private, source-aware statement analyzer for people who want a clearer view of spending without linking bank accounts. **Personality:** composed, precise, considerate.
- **Brand voice:** Direct, human, and explicit about uncertainty. Headline example: “Your spending has a story. Here’s the latest chapter.” Review example: “Unknown until you choose a category.”
- **Wordmark & logo:** Lowercase `spendwise.` wordmark paired with the custom geometric mark in `public/logo.svg`; the asset is also referenced by favicon and platform project metadata.
- **Signature brand color:** Mineral mint `#c7f36a`—used sparingly for the primary action and active navigation state.

## Implementation and serving

The toolchain is pinned through `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`; production assets build to static `dist/`. CSV, Excel, PDF, and charting bundles are split so the initial dashboard does not eagerly load every parser. The app serves on the initialized Preview port 3000. TypeScript is checked by the registered host diagnostics and the project build. The production declaration uses a lockfile-frozen install and the same Vite build. No API secrets, authentication, server, managed database, cloud file storage, or background service are required.
