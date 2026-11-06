# BRIXEN Quotation Management Platform — Configuration & Operations Guide

This operational manual explains how administrators and commercial managers can configure system parameters, update pricing catalogs, manage tax and banking details, and adjust business rules without writing code.

---

## 1. System Parameters Management

Global platform parameters are maintained in two locations:
1. **Google Sheets Worksheet:** `System_Config` (Instant dynamic updates during runtime).
2. **Backend Configuration File:** `backend/Config.gs` (Fallback defaults).

### 1.1 Updating Corporate Statutory & Banking Details
If BRIXEN changes banking details, authorized signatories, or corporate registration:
1. Open the primary Google Sheet: [Open Spreadsheet](https://docs.google.com/spreadsheets/d/16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ/edit).
2. Go to the **`System_Config`** worksheet.
3. Edit the following rows directly:
   - `COMPANY_NAME_AR`: Official Arabic trade name.
   - `COMPANY_NAME_EN`: Official English corporate name.
   - `CR_NUMBER`: Commercial Registration (Current: `7054850701`).
   - `BANK_NAME`: Authorized depository bank (Current: `مصرف الراجحي`).
   - `BANK_IBAN`: Operational IBAN (Current: `SA4080000510608010602103`).
   - `COMPANY_PHONE`: Sales hotline (Current: `+966 58 020 8160`).
   - `COMPANY_EMAIL`: Official quoting email (Current: `info@brixenco.com`).
4. Any newly generated quotation PDF or HTML document will immediately reflect the updated details.

---

### 1.2 Modifying Tax Rate (VAT)
Under Kingdom of Saudi Arabia statutory regulations, standard VAT is currently 15% (`0.15`):
- To update the VAT rate in the database:
  - Edit `DEFAULT_VAT_RATE` in the `System_Config` sheet (e.g. change `0.15` to another percentage).
  - In `backend/Config.gs`, update line 22: `DEFAULT_VAT_RATE: 0.15`.
- The calculation engine will automatically calculate:
  $$\text{VAT Amount} = \text{Net Subtotal} \times \text{VAT Rate}$$

---

### 1.3 Configuring Rule (*) Minimum Surcharge
Rule (*) protects fabrication margins on small openings ($< 1.0\text{ m}^2$):
- **Current Threshold:** `1.000` $\text{m}^2$ (`RULE_STAR_THRESHOLD_M2`).
- **Current Minimum Charge:** `650.00` SAR (`RULE_STAR_SURCHARGE_SAR`).
- **Eligible Categories:** Windows and Doors.
- To modify the flat minimum charge:
  1. In the `System_Config` worksheet, change `RULE_STAR_SURCHARGE_SAR` to the desired value (e.g. `700.00`).
  2. The platform will automatically calculate $N \times 700.00\text{ SAR}$ for any opening under $1.0\text{ m}^2$.

---

## 2. Managing the Commercial Price Catalog (`Price_List`)

The `Price_List` worksheet serves as BRIXEN's centralized rate card.

### 2.1 Adding a New Product Line
To add a new system (e.g. Curtain Wall or Thermal Break):
1. Navigate to the **`Price_List`** sheet.
2. Insert a new row at the bottom:
   - `ItemCode`: e.g. `CW-STICK-50`
   - `Category`: `CurtainWall`
   - `ItemNameAr`: واجهات كرتن وول نظام ستيك 50 مم
   - `ItemNameEn`: Curtain Wall Stick System 50mm
   - `UnitOfMeasure`: `m²`
   - `StandardRateSAR`: `950.00`
   - `MinRateSAR`: `880.00`
   - `MaxRateSAR`: `1200.00`
   - `ProfileDepthMm`: `50`
   - `ProfileThicknessMm`: `2.5`
   - `GlassComposition`: `6mm Sunergy + 16mm Air + 6mm Clear Temp`
   - `HardwareOrigin`: `European`
   - `IsActive`: `TRUE`
3. The new item will immediately appear in the quotation builder dropdowns.

### 2.2 Updating Existing Prices & Audit Logging
When updating baseline rates in the `Price_List` sheet:
1. Modify `StandardRateSAR`.
2. The Google Apps Script trigger automatically logs the change into the **`Price_History`** worksheet, documenting the prior rate, new rate, timestamp, and user who performed the update.

---

## 3. Brand Assets & Corporate Identity Maintenance

The platform uses two high-resolution corporate digital assets embedded via Base64 to ensure 100% offline reliability without external image hosting dependencies:
1. **Black & Scarlet Red Logo:**  
   - Local: `frontend/assets/brixen_logo_black_red.png`  
   - Embedded: `frontend/assets/brand_assets_base64.json` (`logoBlackRed`)
2. **Official Corporate Blue Seal:**  
   - Local: `frontend/assets/brixen_stamp_official.png`  
   - Embedded: `frontend/assets/brand_assets_base64.json` (`stampOfficial`)

If BRIXEN updates its official corporate seal or logo:
1. Save the new transparent PNG image in `frontend/assets/`.
2. Run the base64 encoder script or update `frontend/assets/brand_assets_base64.json`.
3. The master HTML templates in `templates/` and `DocumentGenerator.gs` will automatically render the new graphic.

---

## 4. Production Backup & Recovery

- **Google Sheets Automatic Version History:** Google Sheets maintains continuous cloud revision history. To restore accidental spreadsheet changes, select **File -> Version history -> See version history**.
- **Quotation Archival:** Every issued quotation stores its exact BOQ breakdown snapshot in `Quotation_Items` and `Quotation_Versions`. Even if master rates change in the future, historical quotations remain 100% immutable and audit-compliant.
