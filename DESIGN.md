# Design System: Money Manager Mini Program
**Project ID:** Local WeChat Mini Program

## 1. Visual Theme & Atmosphere
The interface should feel like a private wealth console: calm, precise, modern, and quietly premium. It is not a banking marketing page and not a colorful budgeting app. The visual language is dense enough for repeated financial checks, but softened with generous breathing room, refined surfaces, and deliberate number hierarchy.

The core mood is graphite, porcelain, pine, and brass: a dark net-worth command surface sits above pale analytical panels. The design should communicate privacy and confidence first, then quick scannability. Motion should feel like a financial instrument waking up: slow sheen, pressed surfaces, rising bars, and horizontally browsable insight cards.

## 2. Color Palette & Roles
- **Graphite Ledger Black (#101513):** Primary hero surfaces, account detail headers, and high-emphasis financial totals.
- **Deep Portfolio Pine (#213C33):** Secondary depth in hero gradients and active investment states.
- **Frosted Porcelain Canvas (#F5F7F1):** App background, chosen to keep the interface light without feeling stark.
- **Paper White (#FFFFFF):** Panels, list rows, forms, popups, and chart surfaces.
- **Mist Border (#DDE5D8):** Thin structural borders around cards, rows, inputs, and chart frames.
- **Muted Slate Text (#687469):** Secondary labels, timestamps, metadata, and helper copy.
- **Positive Mint (#2F8A5F):** Asset growth, positive balances, selected states, and primary financial actions.
- **Loss Coral (#B94A3E):** Liabilities, negative deltas, and destructive/reset actions.
- **Brass Yield (#B88A3B):** Yield, fund/wealth product accents, and small premium highlights.
- **Market Blue (#365F9E):** Stocks, ETFs, price search, and market-data related information.

## 3. Typography Rules
Use the native Apple/PingFang stack with SF Pro Display for large numbers and tabular numeric rendering for balances. Financial totals should be large, heavy, and tightly set without negative letter spacing. Labels are smaller and semibold, not faint browser-default text. Section titles are short, operational, and heavier than row labels. Body text and list metadata should stay compact so users can scan balances, holdings, and transaction history quickly.

## 4. Component Stylings
* **Buttons:** Primary buttons use Positive Mint on light surfaces and soft white on dark hero surfaces. Buttons are compact with gently pill-shaped corners, designed as tools rather than marketing CTAs.
* **Cards/Containers:** Containers use Paper White with thin Mist Border and whisper-soft shadows. Hero cards use Graphite Ledger Black with a restrained pine gradient. Corners are generously rounded, but repeated list rows remain compact and disciplined.
* **Inputs/Forms:** Inputs sit inside pale porcelain fields with thin borders. Bottom sheets are white, high-contrast, and task-focused with clear two-button action rows.
* **Charts:** Chart surfaces are white, bordered, and visually quiet. Trend visuals should prioritize net-worth movement over decorative chart chrome. Asset allocation should use native segmented bars and large percentage typography rather than relying on fragile canvas charts.
* **Rows:** Account and transaction rows use large right-aligned amounts, muted metadata, and subtle dividers. Rows should look tappable without heavy card nesting.
* **Interactive Surfaces:** Tappable cards compress slightly on press, with lower shadow and a tiny downward translation. Important dashboards include a compact action dock and horizontally scrolling insight cards.

## 5. Layout Principles
Use a mobile-first financial hierarchy: hero total, compact stat strip, analytical chart, distribution, then drill-down lists. Keep page gutters consistent at 28rpx. Major sections use 36rpx top spacing; repeated rows use 20-28rpx internal padding. Avoid nested cards; use hero surfaces, panels, and list rows as distinct layers.

Every screen should answer one operational question quickly:
- Dashboard: What is my net worth and how is it moving?
- Accounts: Where is the money held?
- Account Detail: What makes up this account and what changed?
- Transactions: What balance-changing events happened?
- Settings: What affects valuation, privacy, and sync?
