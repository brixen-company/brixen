# BRIXEN — Automated Quotation Management Platform
### Enterprise Architectural Aluminum, Glazing & Cladding Quoting Engine

**Client:** BRIXEN LLC (شركة بريكسن ذات مسؤولية محدودة)  
**Commercial Registration (C.R.):** `7054850701` | Riyadh, Kingdom of Saudi Arabia  
**Depository Treasury:** Al-Rajhi Bank (`مصرف الراجحي`) | IBAN: `SA4080000510608010602103`  
**Target Cloud Database:** [Google Spreadsheet 16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ](https://docs.google.com/spreadsheets/d/16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ/edit?usp=sharing)  
**System Status:** Production Ready | Automated Test Suite: **19/19 Passing (100%)**

---

## 1. Executive Platform Overview

The **BRIXEN Automated Quotation Management Platform** is a full-stack commercial CPQ (Configure, Price, Quote) system engineered specifically for architectural aluminum systems, glass, doors, windows, cladding, and related building envelopes.

Developed directly on a normalized Google Sheets database architecture backed by Google Apps Script and a modern, responsive HTML5/CSS3/Vanilla JS single-page application (SPA), the platform automates:
1. **Dynamic BOQ Schedule Calculation:** Real-time surface area math ($m \leftrightarrow mm$) with 6-decimal precision.
2. **Revenue Protection via Rule (\*):** Automatic detection of openings $< 1.0\text{ m}^2$ with statutory minimum billing of SAR 650.00 per unit (confirmed in Khobar Villa audit to preserve SAR 1,265.94 in margin).
3. **1:1 Authentic Document Generation:** Pixel-perfect reproduction of BRIXEN’s official Arabic (`BRX/QT/KHB/...`) and English (`BRX-QT-KRIS-...`) quotation layouts with embedded vector-grade corporate branding and official seal.
4. **Idempotent Database Provisioning:** Single-click zero-data-loss initialization (`initializeDatabase()`) configuring all 12 normalized worksheets with color-coded headers, frozen panes, and data validation rules.
5. **Executive Governance:** Real-time administrative controls resolving the four historical commercial conflicts between Arabic and English contracting models.

---

## 2. Platform Architecture & Directory Structure

```text
d:\salla\بيرتيكس\BRIXEN_Quotation_Platform\
├── backend/                             # Google Apps Script Production Backend
│   ├── Config.gs                        # Central parameters, spreadsheet ID, tax & business rules
│   ├── Database.gs                      # 12-Sheet schema, initializeDatabase(), CRUD & audit engine
│   ├── QuotationService.gs              # Server-side calculation, Rule (*), LockService concurrency
│   ├── DocumentGenerator.gs             # 1:1 Arabic & English HTML/PDF generation to Drive
│   ├── TestSuite.gs                     # 10 automated server-side integration test cases
│   ├── Code.gs                          # REST Web App endpoints (doGet/doPost) & RPC dispatcher
│   └── appsscript.json                  # Manifest file with Sheets/Drive/Docs OAuth scopes
│
├── frontend/                            # Single-Page Application (SPA)
│   ├── index.html                       # Responsive dashboard, BOQ builder, history & decisions
│   ├── styles.css                       # Corporate design system (Navy/Red/Gold) & A4 print CSS
│   ├── app.js                           # Client controller, live math engine, dual-mode RPC/Mock
│   └── assets/                          # Corporate digital assets
│       ├── brixen_logo_black_red.png    # Official Black typography with Scarlet Red X
│       ├── brixen_stamp_official.png    # Official blue corporate seal (C.R. 7054850701)
│       ├── brixen_logo_monochrome.png   # Monochrome logo asset
│       └── brand_assets_base64.json     # Embedded Base64 URIs for 100% offline document rendering
│
├── templates/                           # Master Quotation Templates (1:1 Reproduction)
│   ├── quotation_ar_template.html       # Master Arabic RTL template (Khobar Villa specification)
│   ├── quotation_en_template.html       # Master English LTR template (Eng. Kris specification)
│   └── templates_metadata.json          # Typography, layout dimensions, page margins & font stacks
│
├── tests/                               # Test Automation
│   ├── run_local_tests.py               # Local Python unit/integration test runner (19 assertions)
│   └── test_results.json                # Latest execution report (100% PASS)
│
└── docs/                                # Technical & Operational Documentation
    ├── DATABASE_SCHEMA.md               # Complete 12-worksheet 3NF relational data dictionary
    ├── DEPLOYMENT_GUIDE.md              # Step-by-step Apps Script & Google Cloud deployment guide
    ├── OUTSTANDING_DECISIONS.md         # Executive memorandum resolving the 4 commercial conflicts
    └── CONFIGURATION_GUIDE.md           # Operational manual for rate cards, VAT & parameters
```

---

## 3. Key Business Rules & Mathematical Models

### 3.1 Surface Area & Unit Conversion
The platform accepts dimensions in meters ($m$) or millimeters ($mm$) and standardizes area calculation:
$$\text{Unit Area } (m^2) = \begin{cases} W \times H & \text{if unit } = m \\ \frac{W \times H}{1,000,000} & \text{if unit } = mm \end{cases}$$
$$\text{Total Area } (m^2) = \text{Unit Area} \times \text{Count}$$

### 3.2 Minimum Charge Rule (\*)
To prevent margin loss on small bathroom and pantry windows that incur full manufacturing overhead:
$$\text{Line Total (SAR)} = \begin{cases} \text{Count} \times 650.00 & \text{if } \text{Category} \in \{\text{Windows}, \text{Doors}\} \land 0 < \text{Unit Area} < 1.000\text{ m}^2 \\ \text{Billable Area} \times \text{Unit Rate} & \text{otherwise} \end{cases}$$

### 3.3 Statutory VAT & Grand Total
Under Saudi ZATCA statutory compliance:
$$\text{Subtotal} = \sum_{i=1}^{n} \text{Line Total}_i$$
$$\text{VAT Amount} = \text{round}(\text{Subtotal} \times 0.15, 2)$$
$$\text{Grand Total} = \text{round}(\text{Subtotal} + \text{VAT Amount}, 2)$$

---

## 4. Test Suite Execution & Verification

The platform includes an automated local verification suite (`tests/run_local_tests.py`) that audits the engine against authentic historical workspace records:

```text
==========================================================
BRIXEN PLATFORM — AUTOMATED SYSTEM TEST SUITE
==========================================================
--- Test Group 1: Area Conversion & Precision ---
  [PASS] Area in Meters (2.0 x 3.0) (6.00 == 6.00)
  [PASS] Area in Millimeters (1200 x 1500 mm x 2) (3.60 == 3.60)

--- Test Group 2: Rule (*) Minimum Pricing (< 1.0 m^2) ---
  [PASS] W4 Maid Room: Rule (*) flag triggered
  [PASS] W4 Maid Room: Flat SAR 650 applied (650.00 == 650.00)
  [PASS] Boundary 1.0 m^2: Rule (*) NOT triggered
  [PASS] Boundary 1.0 m^2: Standard Area*Rate applied (650.00 == 650.00)
  [PASS] Multi-Unit (<1m^2, Qty=3): Triggered
  [PASS] Multi-Unit: 3 x SAR 650 = 1950 (1950.00 == 1950.00)

--- Test Group 3: Authentic Khobar Villa Quotation Audit ---
  [PASS] Khobar Villa: Subtotal (Target: 53,989.52) (53989.52 == 53989.52)
  [PASS] Khobar Villa: 15% VAT (Target: 8,098.43) (8098.43 == 8098.43)
  [PASS] Khobar Villa: Grand Total (Target: 62,087.95) (62087.95 == 62087.95)
  [PASS] Khobar Villa: Exactly 4 units triggered Rule (*)

--- Test Group 4: Eng. Kris Quotation Audit ---
  [PASS] Kris Quote: Subtotal exactly SAR 40,000.00 (40000.00 == 40000.00)
  [PASS] Kris Quote: VAT exactly SAR 6,000.00 (6000.00 == 6000.00)
  [PASS] Kris Quote: Grand Total exactly SAR 46,000.00 (46000.00 == 46000.00)

--- Test Group 5: Asset & File Verification ---
  [PASS] Asset: Black & Red Logo exists
  [PASS] Asset: Official Blue Stamp exists
  [PASS] Template: Master Arabic HTML exists
  [PASS] Template: Master English HTML exists

==========================================================
TEST RUN COMPLETED: 19 PASSED / 0 FAILED (TOTAL: 19)
==========================================================
```

---

## 5. Quick Start Guide

### Option A: Launching Frontend Locally (Instant Zero-Dependency)
1. Double-click `frontend/index.html` in your browser (Chrome, Edge, Firefox).
2. The platform opens in offline mock mode, pre-populated with real Khobar Villa and Eng. Kris quotation records, customer directory, and active BOQ builder.
3. Test adding, deleting, and modifying openings: note instant recalculation of area, Rule (\*) detection, and summary totals.
4. Click **معاينة وطباعة عرض السعر (Preview & Print)** to view the 1:1 authentic document with official branding and print it to PDF via browser print (`Ctrl + P`).

### Option B: Deploying to Google Apps Script & Google Sheets
Follow the detailed instructions in [docs/DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md):
1. Open the [Google Spreadsheet](https://docs.google.com/spreadsheets/d/16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ/edit).
2. Go to **Extensions -> Apps Script**.
3. Copy the files from `backend/` into the Apps Script editor.
4. Run `initializeDatabase()` to automatically create and format all 12 sheets.
5. Deploy as Web App and paste the Web App URL into `frontend/app.js` (`WEB_APP_URL`).

---

## 6. Documentation Index

- [Database Schema Specification](docs/DATABASE_SCHEMA.md)
- [Deployment & Setup Guide](docs/DEPLOYMENT_GUIDE.md)
- [Executive Memorandum on Business Decisions](docs/OUTSTANDING_DECISIONS.md)
- [Configuration & Operations Manual](docs/CONFIGURATION_GUIDE.md)
- [Forensic File Analysis Report (Phase 1)](../Comprehensive_Analysis_Report/Comprehensive_Analysis_Report.pdf)
- [Executive Summary Report (Phase 1)](../Comprehensive_Analysis_Report/Executive_Summary.pdf)
