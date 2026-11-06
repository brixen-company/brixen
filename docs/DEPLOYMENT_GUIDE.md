# BRIXEN Quotation Management Platform — Deployment & Production Guide

This guide details the step-by-step procedure to deploy the BRIXEN Quotation Management Platform on **Google Apps Script** connected to the authorized **Google Sheets** production database.

---

## 1. Prerequisites & Assets Checklist

Ensure you have access to:
1. **Google Account** with Editor/Owner access to the primary database spreadsheet:  
   `https://docs.google.com/spreadsheets/d/16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ/edit`
2. **Local Repository Files** located at:  
   `d:\salla\بيرتيكس\BRIXEN_Quotation_Platform\`
   - `backend/Config.gs`
   - `backend/Database.gs`
   - `backend/QuotationService.gs`
   - `backend/DocumentGenerator.gs`
   - `backend/TestSuite.gs`
   - `backend/Code.gs`
   - `backend/appsscript.json`
   - `frontend/index.html`
   - `frontend/styles.css`
   - `frontend/app.js`

---

## 2. Step-by-Step Google Apps Script Deployment

### Step 2.1: Open Apps Script from Google Sheets
1. Navigate to the master Google Sheet: [Open Spreadsheet](https://docs.google.com/spreadsheets/d/16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ/edit).
2. In the top navigation bar, click: **Extensions (التطبيقات الإضافية)** -> **Apps Script (برمجة تطبيقات Google)**.
3. A new tab will open with the Google Apps Script IDE.
4. In the upper-left corner, rename the project from "Untitled project" to:  
   `BRIXEN Quotation Engine Backend`

---

### Step 2.2: Enable Manifest (`appsscript.json`) in the Editor
1. In the Apps Script left sidebar, click the **Gear Icon (Project Settings / إعدادات المشروع)**.
2. Check the box labeled:  
   ☑ **Show "appsscript.json" manifest file in editor (إظهار ملف البيان في المحرر)**.
3. Return to the **Editor (< >)** tab. You will now see `appsscript.json` in the file list.

---

### Step 2.3: Paste the Master Backend Code (`Code.gs`)

All backend modules (Configuration, Database Engine, Quotation Math, Document Generator, Test Suite, and Web App Endpoints) have been consolidated into **a single unified file**: [`backend/Code.gs`](file:///d:/salla/بيرتيكس/BRIXEN_Quotation_Platform/backend/Code.gs).

You do **NOT** need to create multiple `.gs` files. In your Apps Script editor:

1. **`appsscript.json`**:
   - Click on `appsscript.json` in the file list.
   - Replace its entire contents with the code from `backend/appsscript.json`.
   - *This grants OAuth scopes for Google Sheets, Google Drive, and Google Docs.*

2. **`Code.gs`**:
   - Click on the default `Code.gs` file.
   - Delete any existing sample code.
   - Paste the **entire contents** of [`backend/Code.gs`](file:///d:/salla/بيرتيكس/BRIXEN_Quotation_Platform/backend/Code.gs).
   - If you had previously created other files (`Config.gs`, `Database.gs`, `DocumentGenerator.gs`, etc.), you can safely delete them by clicking the three dots next to each file and selecting **Delete**.

Click the **Save project (Ctrl + S)** floppy disk icon.

Click the **Save project (Ctrl + S)** floppy disk icon.

---

### Step 2.4: Execute Database Auto-Initialization (`initializeDatabase`)

1. In the toolbar at the top of the Apps Script editor, locate the **Run (تشغيل)** function dropdown.
2. Select the function: **`initializeDatabase`**.
3. Click **Run**.
4. **Google Authorization Dialog will appear:**
   - Click **Review permissions (مراجعة الأذونات)**.
   - Select your Google Account.
   - If a warning screen appears ("Google hasn't verified this app / لم تتحقق Google من هذا التطبيق"):
     - Click **Advanced (خيارات متقدمة)** at the bottom-left.
     - Click **Go to BRIXEN Quotation Engine Backend (unsafe) / الانتقال إلى مشروع بريكسن**.
     - Click **Allow (السماح)**.
5. The function will run and output the execution log:
   ```text
   Starting BRIXEN Database Auto-Initialization...
   Target Spreadsheet ID: 16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ
   Created/Verified worksheet: Quotations (25 columns)
   Created/Verified worksheet: Quotation_Items (21 columns)
   Created/Verified worksheet: Customers (13 columns)
   Created/Verified worksheet: Projects (9 columns)
   Created/Verified worksheet: Price_List (13 columns)
   Created/Verified worksheet: Price_History (7 columns)
   Created/Verified worksheet: Payment_Terms (6 columns)
   Created/Verified worksheet: System_Config (5 columns)
   Created/Verified worksheet: Business_Decisions (5 columns)
   Created/Verified worksheet: Audit_Log (7 columns)
   Created/Verified worksheet: Quotation_Versions (14 columns)
   Created/Verified worksheet: Schema_Version (4 columns)
   === Database Auto-Initialization Finished Successfully ===
   ```
6. Return to your Google Sheet browser tab. You will now observe all 12 color-coded tabs with bold navy headers, frozen top rows, and pre-populated seed data!

---

### Step 2.5: Execute Server Test Suite (`runAllServerTests`)

1. In the Apps Script toolbar function dropdown, select: **`runAllServerTests`**.
2. Click **Run**.
3. Check the execution log to verify that all 10 unit and integration tests pass:
   - `testDatabaseInitialization`: PASS
   - `testAreaCalculationMeters`: PASS
   - `testAreaCalculationMillimeters`: PASS
   - `testRuleStarMinimumPricing`: PASS
   - `testRuleStarBoundaryCondition`: PASS
   - `testQuotationSubtotalVatTotal`: PASS
   - `testReferenceNumberGeneration`: PASS
   - `testAuditLogging`: PASS
   - `testPriceListFetch`: PASS
   - `testKhobarVillaExactTotals`: PASS (SAR 53,989.52 / SAR 62,087.95)

---

### Step 2.6: Deploy as Web Application (Production URL)

1. In the upper-right corner of the Apps Script editor, click the blue **Deploy (نشر)** button -> **New deployment (توزيع جديد)**.
2. Next to "Select type", click the **Gear Icon** -> select **Web app (تطبيق ويب)**.
3. Configure the deployment settings:
   - **Description:** `BRIXEN Quotation Production Web App v1.0`
   - **Execute as (تنفيذ كـ):** `Me (shahd...@gmail.com)` *(Ensures database read/write permissions)*
   - **Who has access (من يملك إمكانية الوصول):**
     - Select **Anyone (أي شخص)** (if deployed as a public company portal), OR
     - **Only myself** (for testing), OR
     - **Anyone within your Google Workspace organization**.
4. Click **Deploy (توزيع)**.
5. Copy the generated **Web App URL** (e.g. `https://script.google.com/macros/s/AKfycbx.../exec`).

---

## 3. Connecting Frontend to the Live Apps Script Web App

If you are running the frontend dashboard (`frontend/index.html`):
1. Open `frontend/app.js`.
2. Locate line 85:
   ```javascript
   WEB_APP_URL: '', // Set your deployed Google Apps Script Web App URL here
   ```
3. Paste the Web App URL obtained in Step 2.6:
   ```javascript
   WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbx.../exec',
   ```
4. Now the frontend dashboard will automatically communicate via live REST RPC with your Google Sheets database in the cloud!
5. If running completely offline or without internet access, the platform automatically falls back to the embedded zero-latency Local Mock Engine with 100% full functionality.

---

## 4. Security & Permissions Troubleshooting

| Issue / Error | Root Cause | Solution |
|:---|:---|:---|
| `Exception: You do not have permission to call SpreadsheetApp.openById` | The Google account deploying Apps Script lacks edit access to spreadsheet `16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ`. | Share the Google Spreadsheet with the deploying account with "Editor" permission. |
| `ScriptError: Authorization is required` | OAuth scopes have not been accepted. | Run any function (e.g. `initializeDatabase`) in Apps Script IDE and accept permissions. |
| `CORS Error when calling Web App` | Web App URL was called without standard redirect handling or user is not authorized. | Ensure "Who has access" is set to "Anyone" and execute as "Me". |
| `DriveApp: Cannot create folder` | Free personal Google account storage full. | Free up space in Google Drive or configure shared team drive in `Config.gs`. |
