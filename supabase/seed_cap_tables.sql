-- Cap table seed — 2026-08-27 sweep of the SharePoint audit folders.
-- One block loads every company below: replaces each matched company's share
-- classes and stamps cap_table_as_of with the SOURCE DOCUMENT date (which is
-- what makes staleness visible in the tab). A pattern that matches zero or
-- several portfolio_companies rows is SKIPPED, not an error — the report at
-- the end shows companies_matched for every pattern; fix the pattern and
-- re-run (safe: replaces on each run).
-- Basking was loaded separately on 2026-08-27 and is not repeated here.
--
-- Sources (per company) are named in the first class row's notes.

CREATE TEMP TABLE _cap(
  pattern text, as_of date, name text, class_type text,
  shares numeric, price numeric, liq numeric, sen int, notes text
);

INSERT INTO _cap VALUES
-- ── Arrivo BioVentures, LLC — "Post Series B Final Cap Table" (CURRENT sheet), as of 2024-06-14 ──
('%arrivo%','2024-06-14','Series B-1 Preferred Units','Preferred',880783,51.3735,NULL,1,'Source: Arrivo BioVentures Post Series B Final Cap Table.xlsx. Solas Arrivo B Sidecar 35,038 + EHF 101,219. B-1/B-2 relative seniority not stated in source.'),
('%arrivo%','2024-06-14','Series B-2 Preferred Units','Preferred',111911,NULL,NULL,1,NULL),
('%arrivo%','2024-06-14','Series A Preferred Units','Preferred',2450000,NULL,NULL,2,'Solas Arrivo Sidecar 150,000 + Solas Fund I 100,000.'),
('%arrivo%','2024-06-14','Profits Interest Units','Other',233820,NULL,NULL,NULL,NULL),
('%arrivo%','2024-06-14','Common Units','Common',1000000,NULL,NULL,NULL,NULL),

-- ── CardioNXT, Inc. — "CNXT and AFTX Equity Debt Simplified-11-15-25.xlsx", audited as of 2025-08-31 ──
('%nxt%','2025-08-31','Series C Preferred','Preferred',18643912,NULL,NULL,1,'Source: CNXT and AFTX Equity Debt Simplified-11-15-25.xlsx (audited 8/31/2025). Includes 12,254,136 sh from 2021/2022/2023/2024 note conversions; 8/1/25 tranche converted at $0.7528 (file est. valuation $36.2M). Solas Cardio Sidecar 4,685,314 as-conv + Fund II 980,669.'),
('%nxt%','2025-08-31','Series B Preferred','Preferred',5364069,NULL,NULL,2,'Solas Fund I 2,001,560.'),
('%nxt%','2025-08-31','Series A-1 Preferred','Preferred',2691400,NULL,NULL,3,NULL),
('%nxt%','2025-08-31','Series A Preferred','Preferred',6697488,NULL,NULL,4,NULL),
('%nxt%','2025-08-31','Common Stock','Common',14155314,NULL,NULL,NULL,NULL),
('%nxt%','2025-08-31','Options outstanding','Option pool',500000,NULL,NULL,NULL,NULL),
('%nxt%','2025-08-31','2025A Notes','Other',NULL,NULL,1,NULL,'$2.0M principal (Soffer $1.84M, Phelps $0.16M), 4%, matures 8/15/2026. Optional conversion to C-1 at $0.7528 ($50M valuation). 1x principal + interest preference. No share count until conversion.'),

-- ── AFTx, Inc. — same workbook, audited as of 2025-08-31 ──
('%aftx%','2025-08-31','Series C Preferred','Preferred',24291016,NULL,NULL,1,'Source: CNXT and AFTX Equity Debt Simplified-11-15-25.xlsx (audited 8/31/2025). Includes 15,915,807 sh from note conversions; 8/1/25 tranche at $0.2877 (file est. valuation $18.1M).'),
('%aftx%','2025-08-31','Series B Preferred','Preferred',11704404,NULL,NULL,2,NULL),
('%aftx%','2025-08-31','Series A Preferred (as-converted)','Preferred',2616008,NULL,NULL,3,'2,533,037 preferred outstanding; shown as-converted to common (1.0327:1) so the FD total matches the source.'),
('%aftx%','2025-08-31','Common Stock','Common',23086450,NULL,NULL,NULL,NULL),
('%aftx%','2025-08-31','Options outstanding','Option pool',1165000,NULL,NULL,NULL,NULL),
('%aftx%','2025-08-31','2025A Notes','Other',NULL,NULL,1,NULL,'$1.0M principal (Soffer $0.92M, Phelps $0.08M), 4%, matures 8/15/2026. Optional conversion to C-1 at $0.2877. 1x principal + interest preference.'),

-- ── Cryosa, Inc. — Carta export, as of 2024-08-26 ──
('%cryosa%','2024-08-26','Series B Preferred (PB)','Preferred',12716296,2.57,NULL,1,'Source: Cryosa Cap Table - 08.26.24.xlsx (Carta). Solas Fund II 1,203,477 + Cryosa Sidecar 2,695,165. NOTE: Series B Prime round in progress (pro forma on file, Feb 2026) — this table predates it.'),
('%cryosa%','2024-08-26','Series A-2 Preferred (PA2)','Preferred',5692953,1.45,NULL,2,NULL),
('%cryosa%','2024-08-26','Series A-1 Preferred (PA1)','Preferred',5085283,0.88,NULL,3,NULL),
('%cryosa%','2024-08-26','Common (CS)','Common',6041885,NULL,NULL,NULL,NULL),
('%cryosa%','2024-08-26','2018 Plan - options & RSUs outstanding','Option pool',4573792,NULL,NULL,NULL,NULL),
('%cryosa%','2024-08-26','2018 Plan - available for issuance','Option pool',974323,NULL,NULL,NULL,NULL),
('%cryosa%','2024-08-26','2024 Note Financing (CN)','Other',NULL,NULL,NULL,NULL,'$7,362,500 principal outstanding at the as-of date — no share count until conversion, excluded from FD total.'),

-- ── Dimension Inx Corp — Carta export, as of 2025-06-30 ──
('%dimension%','2025-06-30','Series A Preferred (PA)','Preferred',18425246,0.8141,NULL,1,'Source: dimension-inx-corp_2025-06-30 Carta export. EHF holds 3,439,381 (6.495% FD).'),
('%dimension%','2025-06-30','Series Seed-4 Preferred (PS4)','Preferred',3712798,0.6158,NULL,2,'Seed series seniority assumed reverse-chronological (4 over 3 over 2 over 1); not stated in the Carta export.'),
('%dimension%','2025-06-30','Series Seed-3 Preferred (PS3)','Preferred',3906251,0.288,NULL,3,NULL),
('%dimension%','2025-06-30','Series Seed-2 Preferred (PS2)','Preferred',693298,0.3029,NULL,4,NULL),
('%dimension%','2025-06-30','Series Seed-1 Preferred (PS1)','Preferred',5694445,0.36,NULL,5,NULL),
('%dimension%','2025-06-30','Series A Warrants (PWA)','Warrants',132377,NULL,NULL,NULL,'Western Alliance Bank.'),
('%dimension%','2025-06-30','Common (CS)','Common',11751563,NULL,NULL,NULL,NULL),
('%dimension%','2025-06-30','2020 Plan - options & RSUs outstanding','Option pool',5613885,NULL,NULL,NULL,NULL),
('%dimension%','2025-06-30','2020 Plan - available for issuance','Option pool',3020771,NULL,NULL,NULL,NULL),

-- ── Francis Medical, Inc. — post FULL Series C, from "Francis all entity waterfall.xlsx" (4/6/2026) ──
-- The earlier 7/31/2025 pro forma double counted Solas: its "Solas BioVentures
-- 33,812,116" line is EXACTLY the sum of Fund II + Francis Sidecar + H2Oey I +
-- H2Oey II — an aggregate, not a fifth holder. This version is the corrected,
-- T2-complete capitalization. Price on the aggregate preferred is the blended
-- $158,032,236 / 126,374,519 so shares × price reproduces the preference basis.
('%francis%','2026-04-06','Preferred (all series, aggregate)','Preferred',126374519,1.2505057,1,1,'Source: Francis all entity waterfall.xlsx (4/6/2026). $158.0M invested across all series; per-series split not in source. Series C complete: T1 $1.3125 / T2 ~$1.4437, $80.0M. 1x PARTICIPATING per the company model ("return of preference and then pro-rata"). Accepted J&J acquisition (~$1,119M) pending. Within this aggregate the CRM waterfall pro-rates preference by shares, not invested $ — entity payouts land within ~1% of the company model.'),
('%francis%','2026-04-06','Common Stock','Common',1537432,NULL,NULL,NULL,'Boston Scientific 1,109,938 + other legacy NXT 427,494.'),
('%francis%','2026-04-06','Option & RSA pool - granted','Option pool',18488330,NULL,NULL,NULL,'Founder 3,653,745 + board 1,964,445 + employees/consultants 12,870,140.'),
('%francis%','2026-04-06','Option pool - available','Option pool',13489657,NULL,NULL,NULL,NULL),

-- ── I/O Urology Corporation — Carta export, as of 2024-08-26 ──
('%urology%','2024-08-26','Series A-1 Preferred (PA1)','Preferred',19386561,NULL,NULL,1,'Source: io-urology-corporation_2024-08-26 Carta export. $13.4M cash raised (~$0.691/sh). A-2 through A-6 show $0 cash raised in Carta. Series seniority assumed by number; not stated.'),
('%urology%','2024-08-26','Series A-2 Preferred (PA2)','Preferred',2109703,NULL,NULL,2,NULL),
('%urology%','2024-08-26','Series A-3 Preferred (PA3)','Preferred',1220607,NULL,NULL,3,NULL),
('%urology%','2024-08-26','Series A-4 Preferred (PA4)','Preferred',7029160,NULL,NULL,4,NULL),
('%urology%','2024-08-26','Series A-5 Preferred (PA5)','Preferred',499650,NULL,NULL,5,NULL),
('%urology%','2024-08-26','Series A-6 Preferred (PA6)','Preferred',427762,NULL,NULL,6,NULL),
('%urology%','2024-08-26','Common (CS)','Common',11248335,NULL,NULL,NULL,NULL),
('%urology%','2024-08-26','2021 Plan - available for issuance','Option pool',4657976,NULL,NULL,NULL,'No options outstanding at the as-of date.'),
('%urology%','2024-08-26','Convertibles','Other',NULL,NULL,NULL,NULL,'CPN notes $4,009,925 + SAFEs $1,725,000 outstanding — no share count until conversion.'),

-- ── Phenomics Health — Carta export, as of 2025-12-29 ──
('%phenomics%','2025-12-29','Series A-1 Preferred (PA)','Preferred',14885160,NULL,NULL,1,'Source: phenomics-health_2025-12-29 Carta export. $10.0M cash raised (~$0.672/sh). Carta labels: A-1 = PA, A-2 = PA1.'),
('%phenomics%','2025-12-29','Series A-2 Preferred (PA1)','Preferred',12886174,NULL,NULL,2,NULL),
('%phenomics%','2025-12-29','Common (CS)','Common',8950000,NULL,NULL,NULL,NULL),
('%phenomics%','2025-12-29','2024 Plan - options & RSUs outstanding','Option pool',852000,NULL,NULL,NULL,NULL),
('%phenomics%','2025-12-29','2024 Plan - available for issuance','Option pool',4849546,NULL,NULL,NULL,NULL),
('%phenomics%','2025-12-29','Convertibles','Other',NULL,NULL,NULL,NULL,'SAFEs $4,504,500 + Convertible Note Round (F1) $2,000,000 — no share count until conversion.'),

-- ── Stimdia Medical Inc. — detailed cap table, as of 2025-06-30 ──
('%stimdia%','2025-06-30','Series B Preferred (PB)','Preferred',3652845,4.69,NULL,1,'Source: Stimdia 2025.06.30 Cap Table.xlsx. Solas Fund II 524,419 + Stimdia Sidecar 959,488. Seniority assumed B over A1 over A; not stated.'),
('%stimdia%','2025-06-30','Series A1 Preferred (PA1)','Preferred',854403,5.21,NULL,2,NULL),
('%stimdia%','2025-06-30','Series A Preferred (PA)','Preferred',2375000,1.60,NULL,3,NULL),
('%stimdia%','2025-06-30','Common (CS)','Common',1049896,NULL,NULL,NULL,NULL),
('%stimdia%','2025-06-30','2017 Plan - options & RSUs outstanding','Option pool',781928,NULL,NULL,NULL,NULL),
('%stimdia%','2025-06-30','2017 Plan - available for issuance','Option pool',218072,NULL,NULL,NULL,NULL),

-- ── Vektor Medical, Inc. — Carta export, as of 2024-08-26 (STALE: predates the convertible note and the live ~$25M Series B) ──
('%vektor%','2024-08-26','Series A Preferred (PA)','Preferred',9508345,1.7248,NULL,1,'Source: vektor-medical-inc_2024-08-26 Carta export. $16.4M cash raised. STALE: predates the convertible note and the live Series B raise.'),
('%vektor%','2024-08-26','Series A-1 Preferred (PA1)','Preferred',4402636,NULL,NULL,2,NULL),
('%vektor%','2024-08-26','Series A-2 Preferred (PA2)','Preferred',3568613,NULL,NULL,3,NULL),
('%vektor%','2024-08-26','Series Seed Preferred (as-converted)','Preferred',2211104,NULL,NULL,4,'1,584,610 outstanding, converts 1.3954:1; $5.0M cash raised. Shown as-converted so FD matches Carta.'),
('%vektor%','2024-08-26','Series Seed-1 Preferred (as-converted)','Preferred',1334909,NULL,NULL,5,'1,062,848 outstanding, converts 1.256:1.'),
('%vektor%','2024-08-26','Common (UCS)','Common',10841482,NULL,NULL,NULL,NULL),
('%vektor%','2024-08-26','2017 Plan - options & RSUs outstanding','Option pool',3909984,NULL,NULL,NULL,NULL),
('%vektor%','2024-08-26','2017 Plan - available for issuance','Option pool',1730035,NULL,NULL,NULL,NULL),
('%vektor%','2024-08-26','Convertibles','Other',NULL,NULL,NULL,NULL,'At 8/26/2024: CN $2,682,926 + SAFEs $12,499,000. The later note (10% simple) and the live ~$25M Series B are NOT in this table.'),

-- ── Vesalio (post C-corp conversion) — as of November 2024 ──
('%vesalio%','2024-11-30','Series B Preferred','Preferred',1486194,NULL,NULL,1,'Source: 11.2024 Final Vesalio Post C corp Conversion Cap Table.xlsx. Solas: Vesalio Sidecar 149,817 + EHF 276,751.'),
('%vesalio%','2024-11-30','Series A Preferred','Preferred',2085837,NULL,NULL,2,'Solas: Vesalio Sidecar 516,468 + Fund II 369,004.'),
('%vesalio%','2024-11-30','Common','Common',2682490,NULL,NULL,NULL,NULL),
('%vesalio%','2024-11-30','RSAs','Common',355530,NULL,NULL,NULL,'Restricted stock awards - voting.'),
('%vesalio%','2024-11-30','RSUs','Other',355640,NULL,NULL,NULL,'No voting rights; cash-settled on change of control. Included in FD per source.'),
('%vesalio%','2024-11-30','Available award shares','Option pool',65070,NULL,NULL,NULL,NULL),

-- ── Knopp Sub Investments II, LLC (KSI II) — member schedule as of 2025-08-01 ──
-- The VEHICLE holding the Areteia exposure (EHF → KSI II → Areteia). The CRM has
-- no KSI II row, so per Isaiah (2026-08-27) this lives on the Areteia row —
-- class names prefixed "KSI II" so they cannot be misread as Areteia's own
-- stock. Replace with Areteia Therapeutics' real cap table when one lands.
('Areteia','2025-08-01','KSI II - Class A Units','Other',10100001,NULL,NULL,NULL,'Source: KSI II Cap Table 8-1-25B.xlsx - member schedule of Knopp Sub Investments II, LLC (the Areteia exposure vehicle), NOT Areteia Therapeutics own cap table.'),
('Areteia','2025-08-01','KSI II - Class B Units','Other',4604541,NULL,NULL,NULL,'Solas Areteia SPV 1,792,750.'),
('Areteia','2025-08-01','KSI II - Class C Units','Other',10100000,NULL,NULL,NULL,'EHF 2,906,477 + Solas Areteia SPV 325,523.');

-- Francis preferred is participating (see its note); the temp table above has
-- no column for the flag, so set it right after the insert below.
-- (UPDATE statement follows the INSERT, further down.)

-- Resolve each pattern to exactly one company; anything else is skipped.
CREATE TEMP TABLE _match AS
SELECT p.pattern,
       (SELECT count(*) FROM portfolio_companies pc WHERE pc.name ILIKE p.pattern) AS n,
       (SELECT pc.id  FROM portfolio_companies pc WHERE pc.name ILIKE p.pattern LIMIT 1) AS id
FROM (SELECT DISTINCT pattern FROM _cap) p;

DELETE FROM portfolio_share_classes
WHERE company_id IN (SELECT id FROM _match WHERE n = 1);

INSERT INTO portfolio_share_classes
  (company_id, name, class_type, shares_outstanding, price_per_share, liq_pref_multiple, seniority, notes)
SELECT m.id, c.name, c.class_type, c.shares, c.price, c.liq, c.sen, c.notes
FROM _cap c JOIN _match m USING (pattern)
WHERE m.n = 1;

UPDATE portfolio_share_classes sc SET participating = true
FROM portfolio_companies pc
WHERE sc.company_id = pc.id AND pc.name ILIKE '%francis%' AND sc.name = 'Preferred (all series, aggregate)';

UPDATE portfolio_companies pc
SET cap_table_as_of = x.as_of
FROM (SELECT DISTINCT pattern, as_of FROM _cap) x
JOIN _match m USING (pattern)
WHERE m.n = 1 AND pc.id = m.id;

-- Report: companies_matched must be 1 on every row; fd_shares should match the
-- source workbook totals (see seed comments). A 0 or 2+ means that pattern was
-- skipped - fix it and re-run.
SELECT p.pattern,
       m.n AS companies_matched,
       pc.name AS company,
       pc.cap_table_as_of,
       count(sc.id) AS classes,
       sum(sc.shares_outstanding)::bigint AS fd_shares
FROM (SELECT DISTINCT pattern FROM _cap) p
JOIN _match m USING (pattern)
LEFT JOIN portfolio_companies pc ON pc.id = m.id AND m.n = 1
LEFT JOIN portfolio_share_classes sc ON sc.company_id = pc.id
GROUP BY 1, 2, 3, 4
ORDER BY 1;

-- ── Solas per-entity holdings (2026-08-27, for the quick waterfall) ──────────
-- From the same source workbooks; requires migration_waterfall.sql. One row
-- per (class, Solas vehicle): the same company is held via several entities,
-- and ALL of them receive cash at an exit — H2Oey I included (Solas earns no
-- carry on it, but proceeds still flow through to its investors; the breakout
-- is what keeps that legible). Vektor is deliberately absent — its 8/2024
-- file was summary-only, no holder detail; fill after the Series B.
-- Francis: the 7/31/25 pro forma's "Solas BioVentures 33,812,116" was an
-- AGGREGATE of the four entities below — never enter it as a holder.
WITH fill(pattern, class_name, entity, shares) AS (VALUES
  ('%basking%',  'Series Seed Preferred (PS)',         'Basking Holdings',  2159791::numeric),
  ('%arrivo%',   'Series B-1 Preferred Units',         'EHF',                101219),
  ('%arrivo%',   'Series B-1 Preferred Units',         'Arrivo B Sidecar',    35038),
  ('%arrivo%',   'Series A Preferred Units',           'Arrivo Sidecar',     150000),
  ('%arrivo%',   'Series A Preferred Units',           'Fund I',             100000),
  ('%nxt%',      'Series C Preferred',                 'Cardio Sidecar',    3826936),
  ('%nxt%',      'Series C Preferred',                 'Fund II',            980669),
  ('%nxt%',      'Series B Preferred',                 'Fund I',            2001560),
  ('%nxt%',      'Series B Preferred',                 'Cardio Sidecar',     563728),
  ('%nxt%',      'Common Stock',                       'Cardio Sidecar',     294650),
  ('%aftx%',     'Series C Preferred',                 'Cardio Sidecar',    4688718),
  ('%aftx%',     'Series C Preferred',                 'Fund II',           1285384),
  ('%aftx%',     'Series B Preferred',                 'Fund I',            4096298),
  ('%aftx%',     'Series B Preferred',                 'Cardio Sidecar',    1153700),
  ('%aftx%',     'Common Stock',                       'Cardio Sidecar',     274200),
  ('%cryosa%',   'Series B Preferred (PB)',            'Cryosa Sidecar',    2695165),
  ('%cryosa%',   'Series B Preferred (PB)',            'Fund II',           1203477),
  ('%cryosa%',   'Series A-2 Preferred (PA2)',         'Fund II',            690056),
  ('%dimension%','Series A Preferred (PA)',            'EHF',               3439381),
  ('%francis%',  'Preferred (all series, aggregate)',  'Francis Sidecar',  18428123),
  ('%francis%',  'Preferred (all series, aggregate)',  'H2Oey Ventures II',11626111),
  ('%francis%',  'Preferred (all series, aggregate)',  'H2Oey Ventures',    5403660),
  ('%francis%',  'Preferred (all series, aggregate)',  'Fund II',           4654544),
  ('%urology%',  'Series A-1 Preferred (PA1)',         'EHF',               4369212),
  ('%phenomics%','Series A-1 Preferred (PA)',          'EHF',               4465548),
  ('%stimdia%',  'Series B Preferred (PB)',            'Stimdia Sidecar',    959488),
  ('%stimdia%',  'Series B Preferred (PB)',            'Fund II',            524419),
  ('%vesalio%',  'Series B Preferred',                 'EHF',                276751),
  ('%vesalio%',  'Series B Preferred',                 'Vesalio Sidecar',    149817),
  ('%vesalio%',  'Series A Preferred',                 'Vesalio Sidecar',    516468),
  ('%vesalio%',  'Series A Preferred',                 'Fund II',            369004),
  ('Areteia',    'KSI II - Class B Units',             'Areteia SPV',       1792750),
  ('Areteia',    'KSI II - Class C Units',             'EHF',               2906477),
  ('Areteia',    'KSI II - Class C Units',             'Areteia SPV',        325523)
),
resolved AS (
  SELECT sc.id AS class_id, f.entity, f.shares
  FROM fill f
  JOIN portfolio_companies pc ON pc.name ILIKE f.pattern
  JOIN portfolio_share_classes sc ON sc.company_id = pc.id AND sc.name = f.class_name
),
del AS (
  DELETE FROM portfolio_class_holdings WHERE class_id IN (SELECT class_id FROM resolved)
)
INSERT INTO portfolio_class_holdings (class_id, entity, shares)
SELECT class_id, entity, shares FROM resolved;

-- iO A-1 and Phenomics PA: 1x multiple is DOCUMENTED in the Carta certificate
-- ledgers ("Converts 1:1 CSE, 1x multiple"), so record it as data.
UPDATE portfolio_share_classes sc SET liq_pref_multiple = 1
FROM portfolio_companies pc
WHERE sc.company_id = pc.id AND sc.liq_pref_multiple IS NULL
  AND ((pc.name ILIKE '%urology%'   AND sc.name = 'Series A-1 Preferred (PA1)')
    OR (pc.name ILIKE '%phenomics%' AND sc.name = 'Series A-1 Preferred (PA)'));

-- Verification: 35 rows, grouped per company/class with the entity split.
SELECT pc.name AS company, sc.name AS class, h.entity, h.shares::bigint
FROM portfolio_class_holdings h
JOIN portfolio_share_classes sc ON sc.id = h.class_id
JOIN portfolio_companies pc ON pc.id = sc.company_id
ORDER BY pc.name, sc.seniority NULLS LAST, sc.name, h.shares DESC;

-- ── Note balances for the waterfall (2026-08-27) ─────────────────────────────
-- Requires the convertible_balance / conversion_price columns. Balances are as
-- of each cap table's own date; interest accrued since is NOT included.
-- CNXT/AFTx conversion prices are documented note terms; the rest convert at
-- the waterfall's discount input (default 20% to last round).
-- iO A-1 ($0.6912) and Phenomics PA ($0.6718) prices come from the Carta
-- certificate ledgers — documented, and needed as the notes' reference price.
UPDATE portfolio_share_classes sc SET price_per_share = v.price
FROM (VALUES ('%urology%', 'Series A-1 Preferred (PA1)', 0.6912),
             ('%phenomics%', 'Series A-1 Preferred (PA)', 0.6718)) AS v(pattern, class_name, price)
JOIN portfolio_companies pc ON pc.name ILIKE v.pattern
WHERE sc.company_id = pc.id AND sc.name = v.class_name AND sc.price_per_share IS NULL;

UPDATE portfolio_share_classes sc
SET convertible_balance = v.balance, conversion_price = v.conv_price
FROM (VALUES
  ('%basking%',  'CN Notes',                  75000::numeric,   NULL::numeric),
  ('%cryosa%',   '2024 Note Financing (CN)',  7362500,          NULL),
  ('%vektor%',   'Convertibles',              15181926,         NULL),
  ('%urology%',  'Convertibles',              5734925,          NULL),
  ('%phenomics%','Convertibles',              6504500,          NULL),
  ('%nxt%',      '2025A Notes',               2000000,          0.7528),
  ('%aftx%',     '2025A Notes',               1000000,          0.2877)
) AS v(pattern, class_name, balance, conv_price)
JOIN portfolio_companies pc ON pc.name ILIKE v.pattern
WHERE sc.company_id = pc.id AND sc.name = v.class_name;
