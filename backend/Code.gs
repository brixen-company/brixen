/**
 * ============================================================================
 * BRIXEN AUTOMATED QUOTATION MANAGEMENT PLATFORM (MASTER BACKEND BUNDLE)
 * ============================================================================
 * 
 * Enterprise Architectural Aluminum, Glazing & Cladding Quoting Engine
 * Client: BRIXEN LLC (شركة بريكسن ذات مسؤولية محدودة)
 * Unified Commercial Registration (C.R.): 7054850701
 * Primary Target Spreadsheet ID: 16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ
 * 
 * Architecture: All-in-One Google Apps Script (Code.gs)
 * Description: Contains the full backend stack:
 *   - Global Configuration & Constants (CONFIG)
 *   - 12-Worksheet Normalized Database Engine & Auto-Initialization (initializeDatabase)
 *   - Calculation Engine, Area Math & Rule (*) Minimum Pricing
 *   - Exact 1:1 Arabic & English Quotation Document & PDF Generator
 *   - Automated Server-side Test Suite (runAllServerTests)
 *   - Web App REST API Dispatcher (doGet / doPost) & google.script.run RPC Bridges
 *   - Embedded Standalone Single-Page Application (Zero-dependency UI)
 * 
 * ============================================================================
 */


// ============================================================================
// SECTION 1: SYSTEM CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * BRIXEN Automated Quotation Management Platform
 * File: Config.gs
 * Description: Central system configuration, constants, and default business parameters.
 * Target Spreadsheet ID: 16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ
 */

var CONFIG = {
  // System Metadata
  APP_NAME: 'BRIXEN Automated Quotation Management Platform',
  APP_VERSION: '1.0.0',
  DEPLOYMENT_ENV: 'PRODUCTION',

  // Google Sheets Database Connection
  SPREADSHEET_ID: '16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ',

  // Company Legal & Corporate Profile
  COMPANY: {
    NAME_EN: 'BRIXEN LLC',
    NAME_AR: 'شركة بريكسن ذات مسؤولية محدودة (ذ.م.م)',
    CR_NUMBER: '7054850701',
    LOCATION_EN: 'Riyadh - Kingdom of Saudi Arabia',
    LOCATION_AR: 'الرياض - المملكة العربية السعودية',
    PHONE: '+966 58 020 8160',
    EMAIL: 'info@brixenco.com',
    WEBSITE: 'www.brixenco.com',
    BANK: {
      NAME_EN: 'AL-Rajhi Bank',
      NAME_AR: 'مصرف الراجحي',
      IBAN: 'SA4080000510608010602103',
      BENEFICIARY: 'BRIXEN LLC'
    }
  },

  // Statutory Tax & Currency Settings
  FINANCIAL: {
    DEFAULT_CURRENCY: 'SAR',
    CURRENCY_NAME_AR: 'ريال سعودي',
    DEFAULT_VAT_RATE: 0.15, // 15% statutory KSA VAT
    DECIMAL_PRECISION: 2,
    AREA_PRECISION: 4
  },

  // Quotation Reference Numbering Conventions
  REFERENCE_RULES: {
    PREFIX_DEFAULT: 'BRX/QT',
    PREFIX_ARABIC: 'BRX/QT/KHB',
    PREFIX_ENGLISH: 'BRX/QT/KRIS',
    LOCK_TIMEOUT_MS: 10000 // 10s concurrency lock
  },

  // Business Rule Standards
  BUSINESS_RULES: {
    // Rule (*): Minimum unit pricing for small architectural openings
    MIN_CHARGE_RULE: {
      ENABLED: true,
      AREA_THRESHOLD_M2: 1.000,
      MIN_AMOUNT_SAR: 650.00,
      APPLICATION_BASIS: 'PER_UNIT', // 'PER_UNIT' or 'PER_LINE'
      ASTERISK_FLAG: '*',
      FOOTNOTE_AR: 'علامة (*) تعني تطبيق الحد الأدنى بقيمة 650 ريال للوحدة التي تقل مساحتها عن 1 م².',
      FOOTNOTE_EN: 'Asterisk (*) indicates application of minimum unit price of SAR 650.00 for units < 1.0 m².'
    },

    // Default Quotation Offer Validity
    VALIDITY_DAYS_DEFAULT: 3, // 3 calendar days (due to aluminum/glass volatility)
    VALIDITY_DAYS_ENGLISH_DEFAULT: 7,

    // Standard Project Lead Times
    LEAD_TIME: {
      SUPPLY_DAYS_DEFAULT: 30,
      INSTALLATION_DAYS_DEFAULT: 10,
      FAST_TRACK_SUPPLY_DAYS: 20
    },

    // Payment Milestone Standard (50 / 45 / 5)
    PAYMENT_MILESTONES: {
      ADVANCE_PCT: 50, // 50% upon signing contract
      FACTORY_READY_PCT: 45, // 45% when materials ready at factory prior to delivery
      FINAL_PCT: 5, // 5% milestone
      // Unresolved decision: Handover vs Installation Start
      FINAL_TRIGGER_AR: 'عند البدء بالتركيب', // 5% upon start of installation
      FINAL_TRIGGER_EN: 'After HO' // 5% after Handover
    }
  },

  // Required Database Worksheets
  SHEETS: {
    SETTINGS: 'Settings',
    CUSTOMERS: 'Customers',
    PROJECTS: 'Projects',
    QUOTATIONS: 'Quotations',
    QUOTATION_ITEMS: 'QuotationItems',
    PRICE_LIST: 'PriceList',
    TECHNICAL_SPECS: 'TechnicalSpecifications',
    COMMERCIAL_TERMS: 'CommercialTerms',
    DOCUMENT_TEMPLATES: 'DocumentTemplates',
    QUOTATION_REVISIONS: 'QuotationRevisions',
    AUDIT_LOG: 'AuditLog',
    APP_USERS: 'AppUsers'
  },

  // Drive Storage Folders
  DRIVE: {
    QUOTATIONS_FOLDER_NAME: 'BRIXEN_Issued_Quotations',
    TEMPLATES_FOLDER_NAME: 'BRIXEN_Document_Templates'
  }
};


// ============================================================================
// SECTION 2: DATABASE INITIALIZATION, SCHEMAS & CRUD ENGINE
// ============================================================================

/**
 * BRIXEN Automated Quotation Management Platform
 * File: Database.gs
 * Description: Database initialization, schema validation, worksheet formatting, and CRUD data operations.
 */

/**
 * Returns the primary Google Spreadsheet instance.
 * Throws a clear, descriptive error if permissions are missing.
 */
function getDatabaseSpreadsheet() {
  var id = CONFIG.SPREADSHEET_ID;
  try {
    return SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error(
      'Cannot access Google Spreadsheet (ID: ' + id + '). ' +
      'Please verify that the Google account deploying the script has Editor permissions to this spreadsheet. ' +
      'Original error: ' + e.message
    );
  }
}

/**
 * Master Schema Definition for all 12 required worksheets.
 * Defines column headers, default widths, and validation rules.
 */
var SCHEMA_DEFINITIONS = {
  Settings: {
    headers: ['Key', 'Value', 'Category', 'Description', 'LastUpdated', 'UpdatedBy'],
    widths: [180, 250, 140, 300, 160, 160],
    seedData: function() {
      return [
        ['APP_VERSION', '1.0.0', 'System', 'Current database and software version', new Date().toISOString(), 'SYSTEM'],
        ['COMPANY_NAME_EN', CONFIG.COMPANY.NAME_EN, 'Company', 'Official company English name', new Date().toISOString(), 'SYSTEM'],
        ['COMPANY_NAME_AR', CONFIG.COMPANY.NAME_AR, 'Company', 'Official company Arabic name', new Date().toISOString(), 'SYSTEM'],
        ['CR_NUMBER', CONFIG.COMPANY.CR_NUMBER, 'Company', 'Unified Commercial Registration number', new Date().toISOString(), 'SYSTEM'],
        ['BANK_NAME', CONFIG.COMPANY.BANK.NAME_AR, 'Banking', 'Approved sole corporate bank', new Date().toISOString(), 'SYSTEM'],
        ['BANK_IBAN', CONFIG.COMPANY.BANK.IBAN, 'Banking', 'Approved sole corporate IBAN', new Date().toISOString(), 'SYSTEM'],
        ['VAT_RATE', '0.15', 'Financial', 'Statutory Value Added Tax rate (15%)', new Date().toISOString(), 'SYSTEM'],
        ['CURRENCY', 'SAR', 'Financial', 'Base operating currency', new Date().toISOString(), 'SYSTEM'],
        ['RULE_MIN_CHARGE_ENABLED', 'true', 'Pricing', 'Rule (*) minimum charge for <1.0 m²', new Date().toISOString(), 'SYSTEM'],
        ['RULE_MIN_CHARGE_AMOUNT', '650.00', 'Pricing', 'Flat minimum fee in SAR for <1.0 m²', new Date().toISOString(), 'SYSTEM'],
        ['VALIDITY_DAYS_AR', '3', 'Commercial', 'Default quotation validity in days (Arabic)', new Date().toISOString(), 'SYSTEM'],
        ['VALIDITY_DAYS_EN', '7', 'Commercial', 'Default quotation validity in days (English)', new Date().toISOString(), 'SYSTEM'],
        ['DECISION_PAYMENT_MILESTONE', 'PENDING', 'Decisions', 'Final 5% trigger: Handover vs Installation Start', new Date().toISOString(), 'SYSTEM'],
        ['DECISION_RULE_MIN_UNIVERSAL', 'PENDING', 'Decisions', 'Rule (*) applicability to English & Commercial', new Date().toISOString(), 'SYSTEM'],
        ['DECISION_VALIDITY_DAYS', 'PENDING', 'Decisions', 'Standardization of 3-day validity policy', new Date().toISOString(), 'SYSTEM'],
        ['DECISION_PRICING_CATALOG', 'PENDING', 'Decisions', 'Executive sign-off on master rate card', new Date().toISOString(), 'SYSTEM']
      ];
    }
  },

  Customers: {
    headers: ['CustomerID', 'NameAr', 'NameEn', 'ContactPerson', 'Phone', 'Email', 'City', 'Address', 'CreatedAt', 'CreatedBy'],
    widths: [120, 200, 200, 160, 140, 180, 120, 220, 160, 140],
    seedData: function() {
      return [
        ['CUST-001', 'الأستاذ/ عبد الخالق المري', 'Mr. Abdulkhaliq Al-Marri', 'Abdulkhaliq Al-Marri', '+966 50 000 0000', 'client.khobar@example.com', 'Khobar', 'Al Khobar, Eastern Province', new Date().toISOString(), 'SYSTEM'],
        ['CUST-002', 'المهندس كريس', 'Eng. Kris', 'Eng. Kris', '+966 55 000 0000', 'kris@example.com', 'Riyadh', 'Riyadh, Central Province', new Date().toISOString(), 'SYSTEM']
      ];
    }
  },

  Projects: {
    headers: ['ProjectID', 'CustomerID', 'ProjectNameAr', 'ProjectNameEn', 'Location', 'ScopeType', 'Status', 'CreatedAt'],
    widths: [120, 120, 220, 220, 180, 140, 120, 160],
    seedData: function() {
      return [
        ['PROJ-001', 'CUST-001', 'فلة الخبر - أعمال النوافذ والأبواب والكلادينج', 'Khobar Villa - Doors, Windows & Cladding', 'Khobar, KSA', 'Residential Villa', 'Active', new Date().toISOString()],
        ['PROJ-002', 'CUST-002', 'مشروع أعمال الألمنيوم والواجهات الزجاجية', 'Aluminum Doors, Windows & Glazing Project', 'Riyadh, KSA', 'Commercial/Residential', 'Active', new Date().toISOString()]
      ];
    }
  },

  Quotations: {
    headers: [
      'QuotationID', 'ReferenceNo', 'RevisionNo', 'CustomerID', 'CustomerName', 'ProjectID', 'ProjectName',
      'Date', 'Language', 'Currency', 'SubtotalExclVAT', 'VATRate', 'VATAmount', 'GrandTotal',
      'Status', 'ValidityDays', 'DeliveryDays', 'PaymentTermsCode', 'DocumentURL', 'PDFDriveID', 'CreatedAt', 'CreatedBy'
    ],
    widths: [130, 180, 80, 110, 180, 110, 200, 110, 80, 80, 130, 80, 110, 130, 100, 100, 100, 140, 250, 180, 160, 130],
    seedData: function() { return []; }
  },

  QuotationItems: {
    headers: [
      'ItemID', 'QuotationID', 'ItemCode', 'Category', 'DescriptionAr', 'DescriptionEn',
      'WidthM', 'HeightM', 'UnitCount', 'CalculatedAreaM2', 'BilledAreaM2', 'Unit',
      'UnitRateSAR', 'IsMinimumApplied', 'LineTotalSAR', 'Notes'
    ],
    widths: [110, 130, 90, 110, 250, 250, 90, 90, 80, 120, 120, 70, 110, 120, 120, 180],
    seedData: function() { return []; }
  },

  PriceList: {
    headers: ['SystemID', 'Category', 'SystemNameAr', 'SystemNameEn', 'DefaultGlass', 'Unit', 'BaseRateSAR', 'MinChargeSAR', 'IsActive', 'EffectiveDate'],
    widths: [110, 110, 180, 180, 150, 80, 110, 110, 90, 130],
    seedData: function() {
      return [
        ['SYS-001', 'Windows', 'قطاع سرايا قلاب 45 مم', 'Saraya Hopper Series 45mm', 'GL2 (Frosted 24mm DGU)', 'm²', 650.00, 650.00, true, '2026-10-01'],
        ['SYS-002', 'Windows', 'قطاع سرايا مفصلي/ثابت 105 مم', 'Saraya Fixed/Hinged Series 105mm', 'GL1 (Clear 24mm DGU)', 'm²', 650.00, 650.00, true, '2026-10-01'],
        ['SYS-003', 'Doors', 'قطاع سرايا أبواب 100 مم', 'Saraya Door Series 100mm', 'GL1 (Clear 24mm DGU)', 'm²', 650.00, 650.00, true, '2026-10-01'],
        ['SYS-004', 'Windows', 'رويال سلايدنج 12 سم سحاب', 'Royal SLD Series 12cm Sliding', '24mm Low-E DGU', 'm²', 950.00, 750.00, true, '2026-09-01'],
        ['SYS-005', 'Windows', 'قطاع مفصلي 10 سم دبل أكشن', 'Hinge Series 10cm Turn & Tilt', '24mm Low-E DGU', 'm²', 1050.00, 750.00, true, '2026-09-01'],
        ['SYS-006', 'Cladding', 'تلبيس ألواح كلادينج مضاد للحريق', 'Fire-Rated Composite Cladding Panels', 'N/A', 'm²', 350.00, 500.00, true, '2026-10-01'],
        ['SYS-007', 'Elevator', 'واجهة زجاج مصعد 10 مم فرملس', 'Frameless Glass Elevator Facade 10mm', 'GL3 (10mm Clear Tempered)', 'm²', 350.00, 500.00, true, '2026-10-01']
      ];
    }
  },

  TechnicalSpecifications: {
    headers: ['SpecID', 'Category', 'Code', 'TitleAr', 'TitleEn', 'DetailedSpecsAr', 'DetailedSpecsEn', 'IsStandard'],
    widths: [110, 110, 90, 180, 180, 300, 300, 90],
    seedData: function() {
      return [
        ['SPEC-001', 'Aluminum', 'AL-SAR-45', 'قطاع قلاب 45 مم', 'Hopper Series 45mm', 'قطاع القلاب سرايا 45 مم بسماكة 1.5 مم للحمامات.', 'Saraya 45mm series, 1.5mm wall thickness for bathroom hoppers.', true],
        ['SPEC-002', 'Aluminum', 'AL-SAR-105', 'قطاع نوافذ 105 مم', 'Window Series 105mm', 'قطاع النوافذ الثابتة والمفصلية 105 مم بسماكة 1.5 مم.', 'Saraya 105mm series, 1.5mm wall thickness for fixed/hinged windows.', true],
        ['SPEC-003', 'Aluminum', 'AL-SAR-100', 'قطاع أبواب 100 مم', 'Door Series 100mm', 'قطاع الأبواب سرايا 100 مم بسماكة 2 مم.', 'Saraya 100mm heavy duty door series, 2.0mm wall thickness.', true],
        ['SPEC-004', 'Glass', 'GL1', 'زجاج دبل شفاف 24 مم', '24mm Clear DGU', '6 مم زجاج شفاف مقوى + 12 مم فراغ هواء + 6 مم زجاج شفاف داخلي مقوى.', '24mm DGU: 6mm clear tempered + 12mm air space + 6mm clear tempered.', true],
        ['SPEC-005', 'Glass', 'GL2', 'زجاج دبل مثلج/مرمل 24 مم', '24mm Frosted DGU', '6 مم زجاج شفاف مقوى + 12 مم فراغ هواء + 6 مم زجاج مثلج/مرمل مقوى للحمامات.', '24mm DGU: 6mm clear tempered + 12mm air space + 6mm frosted tempered.', true],
        ['SPEC-006', 'Glass', 'GL3', 'زجاج مصعد فرملس 10 مم', '10mm Elevator Glass', 'زجاج أبيض شفاف مقوى بسماكة 10 مم لواجهة المصعد بنظام فرملس.', '10mm clear white tempered frameless glass facade for elevator shaft.', true],
        ['SPEC-007', 'Accessories', 'ACC-IT-DE', 'إكسسوارات وسيليكون', 'Hardware & Sealants', 'جميع الإكسسوارات إيطالية، والربر EPDM، والسيليكون GP / WACKER ألماني.', 'All mechanical hardware Italian, EPDM rubber gaskets, German GP/WACKER silicone.', true]
      ];
    }
  },

  CommercialTerms: {
    headers: ['TermID', 'Language', 'TermNumber', 'ClauseText', 'IsActive', 'Version'],
    widths: [110, 80, 90, 450, 80, 80],
    seedData: function() {
      return [
        ['TERM-AR-001', 'AR', 1, 'مدة صلاحية عرض السعر: ثلاثة (3) أيام من تاريخ العرض.', true, 1],
        ['TERM-AR-002', 'AR', 2, 'مدة التصنيع والتوريد: 30 يوماً تقويمياً للتوريد، و10 أيام تقويمية للتركيب.', true, 1],
        ['TERM-AR-003', 'AR', 3, 'شروط الدفع: 50% عند توقيع العقد، و45% عند جاهزية المواد بالمصنع وقبل التوريد، و5% عند البدء بالتركيب.', true, 1],
        ['TERM-AR-004', 'AR', 4, 'جميع المقاسات والكميات تخضع للرفع النهائي بالموقع والاعتماد قبل التصنيع.', true, 1],
        ['TERM-AR-005', 'AR', 5, 'علامة (*) تعني تطبيق الحد الأدنى بقيمة 650 ريال للوحدة التي تقل مساحتها عن 1 م².', true, 1],
        ['TERM-AR-006', 'AR', 6, 'الحساب البنكي المعتمد لشركة بريكسن فقط: مصرف الراجحي - IBAN: SA4080000510608010602103.', true, 1],
        ['TERM-EN-001', 'EN', 1, 'Manufacturing Period: 20 calendar days for delivery – 10 calendar days for installation.', true, 1],
        ['TERM-EN-002', 'EN', 2, 'Payment Terms: 50% upon signing the contract; 45% when materials ready at factory prior to delivery; 5% After HO.', true, 1],
        ['TERM-EN-003', 'EN', 3, 'Measurement Basis: Areas calculated from stated overall W x H. Final fabrication subject to verified site dimensions.', true, 1],
        ['TERM-EN-004', 'EN', 4, 'Authorized Corporate IBAN: SA4080000510608010602103 – AL-Rajhi Bank.', true, 1]
      ];
    }
  },

  DocumentTemplates: {
    headers: ['TemplateID', 'Language', 'Format', 'Version', 'DriveFileID', 'LastUpdated', 'Status'],
    widths: [120, 80, 80, 80, 200, 160, 100],
    seedData: function() {
      return [
        ['TMPL-AR-HTML', 'AR', 'HTML', '1.0', 'BUILTIN', new Date().toISOString(), 'ACTIVE'],
        ['TMPL-EN-HTML', 'EN', 'HTML', '1.0', 'BUILTIN', new Date().toISOString(), 'ACTIVE'],
        ['TMPL-AR-DOCX', 'AR', 'DOCX', '1.0', 'PENDING_UPLOAD', new Date().toISOString(), 'DRAFT'],
        ['TMPL-EN-DOCX', 'EN', 'DOCX', '1.0', 'BUILTIN_KRIS', new Date().toISOString(), 'ACTIVE']
      ];
    }
  },

  QuotationRevisions: {
    headers: ['RevisionID', 'QuotationID', 'RevisionNumber', 'PreviousRef', 'Reason', 'ChangedBy', 'CreatedAt', 'ArchiveDocURL'],
    widths: [130, 130, 100, 180, 250, 140, 160, 250],
    seedData: function() { return []; }
  },

  AuditLog: {
    headers: ['LogID', 'Timestamp', 'Actor', 'Action', 'RecordType', 'RecordID', 'Outcome', 'DetailsJSON'],
    widths: [130, 160, 140, 160, 130, 140, 100, 350],
    seedData: function() {
      return [
        ['LOG-0001', new Date().toISOString(), 'SYSTEM', 'DATABASE_INITIALIZATION', 'System', 'ALL', 'SUCCESS', '{"message": "Database initialized by system script"}']
      ];
    }
  },

  AppUsers: {
    headers: ['UserID', 'Email', 'FullName', 'Role', 'Status', 'CreatedAt', 'LastLogin'],
    widths: [120, 200, 180, 120, 100, 160, 160],
    seedData: function() {
      return [
        ['USR-001', 'admin@brixenco.com', 'Shahad (Lead Architect)', 'ADMIN', 'ACTIVE', new Date().toISOString(), new Date().toISOString()],
        ['USR-002', 'operations@brixenco.com', 'Operations Specialist', 'ESTIMATOR', 'ACTIVE', new Date().toISOString(), new Date().toISOString()]
      ];
    }
  }
};

/**
 * Initializes the entire Google Sheets database automatically.
 * Idempotent: Can be run multiple times safely without deleting existing data.
 */
function initializeDatabase() {
  var ss = getDatabaseSpreadsheet();
  var results = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheetsCreated: [],
    sheetsValidated: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  var headerBgColor = '#1F4E79'; // Corporate Navy
  var headerTextColor = '#FFFFFF';

  for (var sheetName in SCHEMA_DEFINITIONS) {
    try {
      var schema = SCHEMA_DEFINITIONS[sheetName];
      var sheet = ss.getSheetByName(sheetName);
      var isNew = false;

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        isNew = true;
        results.sheetsCreated.push(sheetName);
      } else {
        results.sheetsValidated.push(sheetName);
      }

      // Check existing rows
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();

      if (isNew || lastRow === 0) {
        // Set Header Row
        var headers = [schema.headers];
        sheet.getRange(1, 1, 1, schema.headers.length).setValues(headers);

        // Format Header Row
        var headerRange = sheet.getRange(1, 1, 1, schema.headers.length);
        headerRange.setBackground(headerBgColor)
                   .setFontColor(headerTextColor)
                   .setFontWeight('bold')
                   .setFontFamily('Calibri')
                   .setFontSize(10)
                   .setHorizontalAlignment('center')
                   .setVerticalAlignment('middle');

        sheet.setFrozenRows(1);
        sheet.setRowHeight(1, 30);

        // Set column widths
        for (var colIdx = 0; colIdx < schema.widths.length; colIdx++) {
          sheet.setColumnWidth(colIdx + 1, schema.widths[colIdx]);
        }

        // Insert seed data if available
        var seed = schema.seedData();
        if (seed && seed.length > 0) {
          sheet.getRange(2, 1, seed.length, schema.headers.length).setValues(seed);
          sheet.getRange(2, 1, seed.length, schema.headers.length)
               .setFontFamily('Calibri')
               .setFontSize(10)
               .setVerticalAlignment('middle');
        }
      } else {
        // Validate header alignment
        var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
        // If columns are missing at end, append them without touching data
        if (currentHeaders.length < schema.headers.length) {
          for (var h = currentHeaders.length; h < schema.headers.length; h++) {
            var colNum = h + 1;
            sheet.getRange(1, colNum).setValue(schema.headers[h])
                 .setBackground(headerBgColor)
                 .setFontColor(headerTextColor)
                 .setFontWeight('bold');
            sheet.setColumnWidth(colNum, schema.widths[h] || 150);
          }
        }
      }
    } catch (sheetError) {
      results.errors.push('Error on sheet ' + sheetName + ': ' + sheetError.message);
    }
  }

  // Remove default 'Sheet1' if empty and other sheets exist
  try {
    var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
    if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
      ss.deleteSheet(defaultSheet);
    }
  } catch (e) {
    // Ignore sheet deletion error
  }

  return results;
}

/**
 * Validates the schema of the existing database.
 */
function validateDatabaseSchema() {
  var ss = getDatabaseSpreadsheet();
  var report = { valid: true, missingSheets: [], corruptedHeaders: [] };

  for (var sheetName in SCHEMA_DEFINITIONS) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      report.valid = false;
      report.missingSheets.push(sheetName);
    } else {
      var expectedHeaders = SCHEMA_DEFINITIONS[sheetName].headers;
      var lastCol = sheet.getLastColumn();
      var actualHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      for (var i = 0; i < expectedHeaders.length; i++) {
        if (actualHeaders[i] !== expectedHeaders[i]) {
          report.corruptedHeaders.push({
            sheet: sheetName,
            expected: expectedHeaders[i],
            actual: actualHeaders[i] || 'MISSING'
          });
        }
      }
    }
  }
  return report;
}

/**
 * Reads a sheet into an array of objects based on header keys.
 */
function getSheetDataObjects(sheetName) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var rows = [];

  for (var r = 1; r < data.length; r++) {
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = data[r][c];
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Appends a new row to a sheet by mapping object keys to headers.
 */
function appendSheetRow(sheetName, obj) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var val = obj[headers[i]];
    row.push(val !== undefined ? val : '');
  }
  sheet.appendRow(row);
  return true;
}

/**
 * Appends multiple rows to a sheet at once.
 */
function appendSheetRows(sheetName, objList) {
  if (!objList || objList.length === 0) return true;
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Sheet ' + sheetName + ' not found.');

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rows = [];

  for (var j = 0; j < objList.length; j++) {
    var obj = objList[j];
    var row = [];
    for (var i = 0; i < headers.length; i++) {
      var val = obj[headers[i]];
      row.push(val !== undefined ? val : '');
    }
    rows.push(row);
  }

  var startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  return true;
}

/**
 * Logs an audit event to the AuditLog sheet.
 */
function logAuditEvent(action, recordType, recordId, outcome, detailsObj, user) {
  try {
    var logEntry = {
      LogID: 'LOG-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
      Timestamp: new Date().toISOString(),
      Actor: user || 'CURRENT_USER',
      Action: action,
      RecordType: recordType,
      RecordID: String(recordId),
      Outcome: outcome || 'SUCCESS',
      DetailsJSON: JSON.stringify(detailsObj || {})
    };
    appendSheetRow('AuditLog', logEntry);
  } catch (e) {
    // Fail silently so logging error doesn't abort primary transaction
  }
}

/**
 * Calculates high-level dashboard metrics directly from the live database.
 */
function getLiveDashboardMetrics() {
  var quotes = getSheetDataObjects('Quotations');
  var customers = getSheetDataObjects('Customers');
  var projects = getSheetDataObjects('Projects');

  var stats = {
    totalQuotations: quotes.length,
    draftCount: 0,
    issuedCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    expiredCount: 0,
    totalPipelineSAR: 0,
    recentQuotations: [],
    customerCount: customers.length,
    projectCount: projects.length
  };

  for (var i = 0; i < quotes.length; i++) {
    var q = quotes[i];
    var status = (q.Status || '').toUpperCase();
    var val = parseFloat(q.GrandTotal) || 0;

    if (status === 'DRAFT') stats.draftCount++;
    else if (status === 'ISSUED') { stats.issuedCount++; stats.totalPipelineSAR += val; }
    else if (status === 'ACCEPTED') { stats.acceptedCount++; stats.totalPipelineSAR += val; }
    else if (status === 'REJECTED') stats.rejectedCount++;
    else if (status === 'EXPIRED') stats.expiredCount++;
  }

  // Return last 10 quotes in reverse order
  stats.recentQuotations = quotes.slice(-10).reverse();
  return stats;
}


// ============================================================================
// SECTION 3: QUOTATION CALCULATION & CONCURRENCY SERVICE
// ============================================================================

/**
 * BRIXEN Automated Quotation Management Platform
 * File: QuotationService.gs
 * Description: Quotation calculation engine, reference number locking generator, and issuance workflows.
 */

var QuotationService = {

  /**
   * Calculates area for an opening.
   * Supports inputs in meters ('m') or millimeters ('mm').
   */
  calculateArea: function(width, height, count, unit) {
    var w = parseFloat(width) || 0;
    var h = parseFloat(height) || 0;
    var qty = parseInt(count, 10) || 1;
    var u = (unit || 'm').toLowerCase();

    var singleUnitAreaM2 = 0;
    if (u === 'mm') {
      singleUnitAreaM2 = (w * h) / 1000000.0;
    } else {
      singleUnitAreaM2 = w * h;
    }

    var totalAreaM2 = singleUnitAreaM2 * qty;
    return {
      unitAreaM2: Math.round(singleUnitAreaM2 * 1000000) / 1000000,
      totalAreaM2: Math.round(totalAreaM2 * 1000000) / 1000000
    };
  },

  /**
   * Calculates a single BOQ line item enforcing the confirmed Rule (*) logic.
   */
  calculateLineItem: function(item, ruleConfig) {
    ruleConfig = ruleConfig || CONFIG.BUSINESS_RULES.MIN_CHARGE_RULE;
    var areaData = this.calculateArea(item.width, item.height, item.count, item.unit);
    var billedArea = item.billedArea !== undefined && item.billedArea !== null && parseFloat(item.billedArea) > 0
                     ? parseFloat(item.billedArea)
                     : areaData.totalAreaM2;

    var rate = parseFloat(item.unitRate) || 0;
    var qty = parseInt(item.count, 10) || 1;
    var isMinimumApplied = false;
    var lineTotal = 0;

    // Rule (*) evaluation: individual unit area < threshold (1.0 m²)
    var isEligibleCategory = !item.category || item.category === 'Windows' || item.category === 'Doors';
    if (ruleConfig.ENABLED && isEligibleCategory && areaData.unitAreaM2 < ruleConfig.AREA_THRESHOLD_M2 && areaData.unitAreaM2 > 0) {
      isMinimumApplied = true;
      if (ruleConfig.APPLICATION_BASIS === 'PER_UNIT') {
        lineTotal = qty * ruleConfig.MIN_AMOUNT_SAR;
      } else {
        lineTotal = ruleConfig.MIN_AMOUNT_SAR;
      }
    } else {
      lineTotal = billedArea * rate;
    }

    lineTotal = Math.round(lineTotal * 100) / 100;

    return {
      itemCode: item.itemCode || '',
      category: item.category || 'General',
      descriptionAr: item.descriptionAr || '',
      descriptionEn: item.descriptionEn || '',
      width: parseFloat(item.width) || 0,
      height: parseFloat(item.height) || 0,
      unit: item.unit || 'm',
      count: qty,
      unitAreaM2: areaData.unitAreaM2,
      calculatedAreaM2: areaData.totalAreaM2,
      billedAreaM2: billedArea,
      unitRate: rate,
      isMinimumApplied: isMinimumApplied,
      lineTotal: lineTotal,
      notes: item.notes || ''
    };
  },

  /**
   * Recalculates all line items and aggregates quotation financial totals.
   */
  calculateQuotationTotals: function(items, vatRate, ruleConfig) {
    vatRate = (vatRate !== undefined && vatRate !== null) ? parseFloat(vatRate) : CONFIG.FINANCIAL.DEFAULT_VAT_RATE;
    ruleConfig = ruleConfig || CONFIG.BUSINESS_RULES.MIN_CHARGE_RULE;

    var processedItems = [];
    var subtotal = 0;
    var minimumSurchargeCount = 0;

    for (var i = 0; i < items.length; i++) {
      var line = this.calculateLineItem(items[i], ruleConfig);
      processedItems.push(line);
      subtotal += line.lineTotal;
      if (line.isMinimumApplied) minimumSurchargeCount++;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    var vatAmount = Math.round(subtotal * vatRate * 100) / 100;
    var grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;

    return {
      items: processedItems,
      subtotal: subtotal,
      vatRate: vatRate,
      vatAmount: vatAmount,
      grandTotal: grandTotal,
      minimumSurchargeCount: minimumSurchargeCount
    };
  },

  /**
   * Generates a unique, concurrency-protected Quotation Reference Number.
   * Uses LockService to prevent duplicates.
   * Pattern: BRX/QT/{PROJECT_CODE}/{DDMM}/{YYYY} or sequential suffix.
   */
  generateReferenceNumber: function(projectCode, dateObj, lang) {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(CONFIG.REFERENCE_RULES.LOCK_TIMEOUT_MS);
    } catch (e) {
      throw new Error('Server is busy processing another quotation. Please retry in a few moments.');
    }

    try {
      var d = dateObj ? new Date(dateObj) : new Date();
      var day = ('0' + d.getDate()).slice(-2);
      var month = ('0' + (d.getMonth() + 1)).slice(-2);
      var year = d.getFullYear();
      var datePart = day + month;

      var pCode = (projectCode || 'GEN').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4);
      if (!pCode) pCode = (lang === 'EN') ? 'KRIS' : 'KHB';

      var baseRef = 'BRX/QT/' + pCode + '/' + datePart + '/' + year;

      // Check if baseRef exists in Quotations sheet
      var existingQuotes = getSheetDataObjects('Quotations');
      var matchCount = 0;
      for (var i = 0; i < existingQuotes.length; i++) {
        var ref = existingQuotes[i].ReferenceNo || '';
        if (ref.indexOf(baseRef) === 0) matchCount++;
      }

      var finalRef = baseRef;
      if (matchCount > 0) {
        finalRef = baseRef + '-' + ('0' + (matchCount + 1)).slice(-2);
      }

      return finalRef;
    } finally {
      lock.releaseLock();
    }
  },

  /**
   * Main entrypoint: Issues a finalized quotation, calculates amounts,
   * writes records to Sheets, generates documents, and logs the audit trail.
   */
  issueQuotation: function(payload, user) {
    user = user || 'CURRENT_USER';

    // 1. Validation
    if (!payload.customerName && !payload.customerNameAr && !payload.customerNameEn) {
      throw new Error('Customer Name is mandatory.');
    }
    if (!payload.projectName && !payload.projectNameAr && !payload.projectNameEn) {
      throw new Error('Project Name is mandatory.');
    }
    if (!payload.items || payload.items.length === 0) {
      throw new Error('At least one BOQ item is required to issue a quotation.');
    }

    var lang = (payload.languageMode || payload.language || 'AR').toUpperCase();
    var customerName = payload.customerName || (lang === 'AR' ? payload.customerNameAr : payload.customerNameEn);
    var projectName = payload.projectName || (lang === 'AR' ? payload.projectNameAr : payload.projectNameEn);

    // 2. Server-side Recalculation (Zero client trust)
    var totals = this.calculateQuotationTotals(payload.items, payload.vatRate, CONFIG.BUSINESS_RULES.MIN_CHARGE_RULE);

    // 3. Generate Reference Number
    var refNo = payload.referenceNo;
    if (!refNo || refNo.trim() === '' || refNo === 'AUTO') {
      var projCode = payload.projectCode || (lang === 'EN' ? 'KRIS' : 'KHB');
      refNo = this.generateReferenceNumber(projCode, payload.date, lang);
    }

    var quotationId = 'QT-' + Utilities.getUuid().substring(0, 8).toUpperCase();
    var nowIso = new Date().toISOString();

    // 4. Create Header Record
    var quoteRecord = {
      QuotationID: quotationId,
      ReferenceNo: refNo,
      RevisionNo: 1,
      CustomerID: payload.customerId || 'CUST-DIRECT',
      CustomerName: customerName,
      ProjectID: payload.projectId || 'PROJ-DIRECT',
      ProjectName: projectName,
      Date: payload.date || nowIso.substring(0, 10),
      Language: lang,
      Currency: CONFIG.FINANCIAL.DEFAULT_CURRENCY,
      SubtotalExclVAT: totals.subtotal,
      VATRate: totals.vatRate,
      VATAmount: totals.vatAmount,
      GrandTotal: totals.grandTotal,
      Status: 'ISSUED',
      ValidityDays: payload.validityDays || (lang === 'AR' ? 3 : 7),
      DeliveryDays: payload.deliveryDays || 30,
      PaymentTermsCode: payload.paymentTermsCode || (lang === 'AR' ? '50-45-5-INSTALL' : '50-45-5-HO'),
      selectedTerms: payload.selectedTerms || payload.terms || [],
      DocumentURL: '',
      PDFDriveID: '',
      CreatedAt: nowIso,
      CreatedBy: user
    };

    // 5. Create Item Records
    var itemRecords = [];
    for (var j = 0; j < totals.items.length; j++) {
      var itm = totals.items[j];
      itemRecords.push({
        ItemID: 'ITEM-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
        QuotationID: quotationId,
        ItemCode: itm.itemCode || ('ITEM-' + (j + 1)),
        Category: itm.category,
        DescriptionAr: itm.descriptionAr || itm.descriptionEn,
        DescriptionEn: itm.descriptionEn || itm.descriptionAr,
        WidthM: itm.width,
        HeightM: itm.height,
        UnitCount: itm.count,
        CalculatedAreaM2: itm.calculatedAreaM2,
        BilledAreaM2: itm.billedAreaM2,
        Unit: itm.unit,
        UnitRateSAR: itm.unitRate,
        IsMinimumApplied: itm.isMinimumApplied,
        LineTotalSAR: itm.lineTotal,
        Notes: itm.notes
      });
    }

    // 6. Generate Document & PDF
    var docResult = { url: '', fileId: '', isDual: false };
    try {
      docResult = DocumentGenerator.generateQuotationPDF(quoteRecord, totals.items);
      quoteRecord.DocumentURL = docResult.isDual ? (docResult.arabicFile.url + ' | ' + docResult.englishFile.url) : docResult.url;
      quoteRecord.PDFDriveID = docResult.fileId;
    } catch (docErr) {
      // Flag error but continue saving data
      quoteRecord.DocumentURL = 'ERROR: ' + docErr.message;
    }

    // 7. Write to Google Sheets
    appendSheetRow('Quotations', quoteRecord);
    appendSheetRows('QuotationItems', itemRecords);

    // 8. Log Audit
    logAuditEvent('ISSUE_QUOTATION', 'Quotation', quotationId, 'SUCCESS', {
      referenceNo: refNo,
      grandTotal: totals.grandTotal,
      itemsCount: itemRecords.length,
      docURL: quoteRecord.DocumentURL
    }, user);

    return {
      success: true,
      quotationId: quotationId,
      referenceNo: refNo,
      grandTotal: totals.grandTotal,
      documentURL: quoteRecord.DocumentURL,
      pdfDriveId: quoteRecord.PDFDriveID,
      isDual: docResult.isDual || false,
      arabicFile: docResult.arabicFile || null,
      englishFile: docResult.englishFile || null,
      quoteRecord: quoteRecord,
      items: totals.items
    };
  }
};


// ============================================================================
// SECTION 4: 1:1 AUTHENTIC DOCUMENT & PDF GENERATOR
// ============================================================================

/**
 * BRIXEN Automated Quotation Management Platform
 * File: DocumentGenerator.gs
 * Description: Renders exact 1:1 Arabic, 100% Pure English, and Bilingual (AR+EN) quotation documents
 *              with optimized footer margins, page-break protection, and PDF export to Google Drive.
 */

var DocumentGenerator = {

  /**
   * Locates or creates the dedicated Google Drive folder for issued quotations.
   */
  getOrCreateQuotationsFolder: function() {
    var folderName = CONFIG.DRIVE.QUOTATIONS_FOLDER_NAME;
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next();
    }
    return DriveApp.createFolder(folderName);
  },

  /**
   * Generates a PDF file in Google Drive and returns its URL and Drive ID.
   * Supports 'AR' (Arabic only), 'EN' (100% English only), and 'BILINGUAL' (Arabic + English).
   */
  generateQuotationPDF: function(quoteRecord, items) {
    var lang = (quoteRecord.Language || 'AR').toUpperCase();
    var folder = this.getOrCreateQuotationsFolder();
    var cleanRef = (quoteRecord.ReferenceNo || 'QUOTE').replace(/[^a-zA-Z0-9_-]/g, '_');

    if (lang === 'BOTH' || lang === 'BILINGUAL' || lang === 'BI') {
      // 1. Generate Complete Arabic PDF File
      var htmlAr = this.renderArabicHTML(quoteRecord, items);
      var fileNameAr = 'BRX_QT_' + cleanRef + '_AR.pdf';
      var blobAr = Utilities.newBlob(htmlAr, 'text/html', fileNameAr).getAs('application/pdf').setName(fileNameAr);
      var fileAr = folder.createFile(blobAr);
      fileAr.setDescription('BRIXEN Commercial Quotation (Arabic) Ref: ' + quoteRecord.ReferenceNo);

      // 2. Generate Complete 100% English PDF File
      var htmlEn = this.renderEnglishHTML(quoteRecord, items);
      var fileNameEn = 'BRX_QT_' + cleanRef + '_EN.pdf';
      var blobEn = Utilities.newBlob(htmlEn, 'text/html', fileNameEn).getAs('application/pdf').setName(fileNameEn);
      var fileEn = folder.createFile(blobEn);
      fileEn.setDescription('BRIXEN Commercial Quotation (English) Ref: ' + quoteRecord.ReferenceNo);

      return {
        fileId: fileAr.getId(),
        url: fileAr.getUrl(),
        downloadUrl: fileAr.getUrl(),
        fileName: fileNameAr,
        isDual: true,
        arabicFile: {
          fileId: fileAr.getId(),
          url: fileAr.getUrl(),
          fileName: fileNameAr
        },
        englishFile: {
          fileId: fileEn.getId(),
          url: fileEn.getUrl(),
          fileName: fileNameEn
        }
      };
    } else if (lang === 'EN') {
      // English Only PDF File
      var htmlContent = this.renderEnglishHTML(quoteRecord, items);
      var fileName = 'BRX_QT_' + cleanRef + '_EN.pdf';
      var blob = Utilities.newBlob(htmlContent, 'text/html', fileName).getAs('application/pdf').setName(fileName);
      var file = folder.createFile(blob);
      file.setDescription('BRIXEN Commercial Quotation (English) Ref: ' + quoteRecord.ReferenceNo);
      return {
        fileId: file.getId(),
        url: file.getUrl(),
        downloadUrl: file.getUrl(),
        fileName: fileName,
        isDual: false
      };
    } else {
      // Arabic Only PDF File
      var htmlContent = this.renderArabicHTML(quoteRecord, items);
      var fileName = 'BRX_QT_' + cleanRef + '_AR.pdf';
      var blob = Utilities.newBlob(htmlContent, 'text/html', fileName).getAs('application/pdf').setName(fileName);
      var file = folder.createFile(blob);
      file.setDescription('BRIXEN Commercial Quotation (Arabic) Ref: ' + quoteRecord.ReferenceNo);
      return {
        fileId: file.getId(),
        url: file.getUrl(),
        downloadUrl: file.getUrl(),
        fileName: fileName,
        isDual: false
      };
    }
  },

  /**
   * Renders the 100% Arabic Quotation HTML.
   * Matches BRIXEN_Quotation_Khobar_Villa_27Oct2026.pdf layout.
   */
  renderArabicHTML: function(q, items) {
    var subtotalFmt = (parseFloat(q.SubtotalExclVAT) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var vatFmt = (parseFloat(q.VATAmount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var grandTotalFmt = (parseFloat(q.GrandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var itemsRowsHtml = '';
    for (var i = 0; i < items.length; i++) {
      var itm = items[i];
      var rateDisplay = itm.unitRate.toFixed(2) + (itm.isMinimumApplied ? '*' : '');
      var areaDisplay = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
      var totalDisplay = itm.lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      itemsRowsHtml += '<tr>' +
        '<td style="text-align:center; font-weight:bold;">' + (itm.itemCode || (i + 1)) + '</td>' +
        '<td style="text-align:right;">' + (itm.descriptionAr || itm.descriptionEn) + '</td>' +
        '<td style="text-align:center;">' + itm.count + '</td>' +
        '<td style="text-align:center;">' + areaDisplay + ' م²</td>' +
        '<td style="text-align:center;">م²</td>' +
        '<td style="text-align:right;">' + rateDisplay + '</td>' +
        '<td style="text-align:right; font-weight:bold;">' + totalDisplay + '</td>' +
      '</tr>';
    }

    var html = '<!DOCTYPE html>' +
    '<html lang="ar" dir="rtl">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>عرض سعر تجاري - ' + (q.ReferenceNo || '') + '</title>' +
    '<style>' +
    '@page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }' +
    'body { font-family: "Segoe UI", Tahoma, Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.4; margin: 0; padding: 0; }' +
    '.header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }' +
    '.company-title { font-size: 18pt; font-weight: bold; color: #000; letter-spacing: 1px; }' +
    '.company-title span { color: #E30613; }' +
    '.meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9.5pt; }' +
    '.meta-grid td { padding: 4px 6px; border: 1px solid #ccc; }' +
    '.meta-label { font-weight: bold; background-color: #f5f5f5; width: 16%; color: #1F4E79; }' +
    '.section-title { font-size: 11pt; font-weight: bold; color: #1F4E79; margin: 12px 0 6px 0; border-bottom: 1px solid #1F4E79; padding-bottom: 2px; }' +
    '.specs-box { font-size: 9pt; line-height: 1.5; margin-bottom: 10px; background-color: #fafafa; border: 1px solid #eee; padding: 6px 10px; }' +
    '.boq-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }' +
    '.boq-table th { background-color: #1F4E79; color: #fff; padding: 6px 4px; border: 1px solid #1F4E79; text-align: center; }' +
    '.boq-table td { padding: 5px 4px; border: 1px solid #ddd; }' +
    '.summary-table { width: 48%; margin-right: auto; margin-left: 0; border-collapse: collapse; margin-bottom: 12px; font-size: 10pt; }' +
    '.summary-table td { padding: 4px 8px; border: 1px solid #ccc; }' +
    '.summary-label { font-weight: bold; background-color: #f5f5f5; }' +
    '.terms-list { font-size: 9pt; line-height: 1.5; margin: 0; padding-right: 18px; }' +
    '.terms-list li { margin-bottom: 3px; }' +
    '.footer-sign-container { page-break-inside: avoid; break-inside: avoid; margin-top: 25px; padding-top: 10px; border-top: 1px solid #e2e8f0; width: 100%; }' +
    '</style>' +
    '</head>' +
    '<body>' +

    // Header
    '<table class="header-table">' +
      '<tr>' +
        '<td style="vertical-align:top;">' +
          '<div class="company-title">BRI<span>X</span>EN <span style="font-size:12pt; color:#111;">LLC</span></div>' +
          '<div style="font-size:8.5pt; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>' +
          '<div style="font-size:8.5pt; color:#555;">www.brixenco.com | info@brixenco.com</div>' +
        '</td>' +
        '<td style="text-align:left; vertical-align:top;">' +
          '<div style="font-size:15pt; font-weight:bold; color:#1F4E79;">عرض توريد وتركيب</div>' +
          '<div style="font-size:9pt; color:#666;">Ref: ' + (q.ReferenceNo || '') + '</div>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    // Metadata
    '<table class="meta-grid">' +
      '<tr>' +
        '<td class="meta-label">المرجع:</td><td style="font-weight:bold;">' + (q.ReferenceNo || '') + '</td>' +
        '<td class="meta-label">التاريخ:</td><td>' + (q.Date || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">إلى:</td><td style="font-weight:bold;">' + (q.CustomerName || '') + '</td>' +
        '<td class="meta-label">المشروع:</td><td>' + (q.ProjectName || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">الموضوع:</td><td>أعمال الألمنيوم والزجاج والكلادينج</td>' +
        '<td class="meta-label">العملة:</td><td>الريال السعودي (SAR)</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">الأساس:</td><td>الكميات والأبعاد الواردة في جداول المشروع</td>' +
        '<td class="meta-label">التسعير:</td><td>يشمل التوريد والتصنيع والنقل والتركيب</td>' +
      '</tr>' +
    '</table>' +

    // Specs
    '<div class="section-title">أولاً: المواصفات الفنية المعتمدة</div>' +
    '<div class="specs-box">' +
      '• <b>مواصفات الألمنيوم:</b> قطاع القلاب سرايا 45 مم بسماكة 1.5 مم للحمامات. قطاع النوافذ الثابتة والمفصلية 105 مم بسماكة 1.5 مم. قطاع الأبواب سرايا 100 مم بسماكة 2 مم.<br>' +
      '• <b>مواصفات الزجاج:</b> GL1: 6 مم زجاج شفاف مقوى + 12 مم فراغ + 6 مم شفاف مقوى. GL2: 6 مم شفاف مقوى + 12 مم فراغ + 6 مم مثلج مقوى. GL3: زجاج شفاف 10 مم فرملس.<br>' +
      '• <b>الإكسسوارات والسيليكون:</b> جميع الإكسسوارات إيطالية، والربر EPDM، والسيليكون الخارجي والداخلي ألماني GP / WACKER.' +
    '</div>' +

    // BOQ
    '<div class="section-title">ثانياً: جدول الكميات والأسعار (BOQ)</div>' +
    '<table class="boq-table">' +
      '<thead>' +
        '<tr>' +
          '<th style="width:8%;">البند</th>' +
          '<th style="width:42%;">الوصف والأبعاد</th>' +
          '<th style="width:8%;">العدد</th>' +
          '<th style="width:12%;">المساحة</th>' +
          '<th style="width:8%;">الوحدة</th>' +
          '<th style="width:10%;">سعر الوحدة</th>' +
          '<th style="width:12%;">الإجمالي</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        itemsRowsHtml +
      '</tbody>' +
    '</table>' +

    // Financials
    '<table class="summary-table">' +
      '<tr><td class="summary-label">إجمالي البنود قبل الضريبة:</td><td style="text-align:right;">' + subtotalFmt + ' ريال</td></tr>' +
      '<tr><td class="summary-label">ضريبة القيمة المضافة (15%):</td><td style="text-align:right;">' + vatFmt + ' ريال</td></tr>' +
      '<tr style="background-color:#eef4fb;"><td class="summary-label" style="font-size:10.5pt; color:#1F4E79;">الإجمالي شامل الضريبة:</td><td style="text-align:right; font-size:10.5pt; font-weight:bold; color:#1F4E79;">' + grandTotalFmt + ' ريال</td></tr>' +
    '</table>' +

    // Dynamic Terms
    (function() {
      var termsList = (q.selectedTerms || q.terms || []);
      var out = '<div class="section-title">ثالثاً: الشروط التجارية</div><ul class="terms-list">';
      var count = 0;
      if (termsList && termsList.length > 0) {
        termsList.forEach(function(t) {
          if (t.isSelected !== false) {
            var title = t.titleAr ? ('<b>' + t.titleAr + ':</b> ') : '';
            var text = t.textAr || t.textEn || (typeof t === 'string' ? t : '');
            if (text) { out += '<li>' + title + text + '</li>'; count++; }
          }
        });
      }
      if (count === 0) {
        out += '<li><b>مدة صلاحية عرض السعر:</b> ' + (q.ValidityDays || 3) + ' أيام تقويمية من تاريخ العرض.</li>' +
          '<li><b>مدة التصنيع والتوريد:</b> ' + (q.DeliveryDays || 30) + ' يوماً للتوريد بالمصنع، و' + (q.InstallDays || 10) + ' أيام للتركيب بالموقع.</li>' +
          '<li><b>شروط الدفع:</b> 50% عند توقيع العقد، و45% عند جاهزية المواد بالمصنع، و5% عند البدء بالتركيب.</li>' +
          '<li>جميع المقاسات والكميات تخضع للرفع النهائي بالموقع والاعتماد قبل التصنيع.</li>' +
          '<li>علامة (*) تعني تطبيق الحد الأدنى بقيمة 650 ريال للوحدة التي تقل مساحتها عن 1 م².</li>' +
          '<li><b>الحساب البنكي المعتمد حصراً:</b> مصرف الراجحي - IBAN: <b>SA4080000510608010602103</b> باسم شركة بريكسن.</li>';
      }
      out += '</ul>';
      return out;
    })() +

    // Footer & Sign-off
    '<div class="footer-sign-container">' +
      '<table style="width:100%; border-collapse:collapse;">' +
        '<tr>' +
          '<td style="vertical-align:bottom;">' +
            '<div style="font-size:10pt;">شاكرين لكم حسن تعاونكم، ونتطلع للعمل معكم.</div>' +
            '<div style="font-weight:bold; font-size:11pt; color:#1F4E79; margin-top:4px;">شركة بريكسن ذات مسؤولية محدودة</div>' +
            '<div style="font-size:8.5pt; color:#666;">سجل تجاري: 7054850701 | الرياض - المملكة العربية السعودية</div>' +
          '</td>' +
          '<td style="text-align:left; vertical-align:middle; width:220px;">' +
            '<div style="border:2px solid #1F4E79; color:#1F4E79; padding:8px 14px; text-align:center; font-size:9pt; font-weight:bold; background-color:#f9fbfe; border-radius:4px;">' +
              'BRIXEN LLC<br>' +
              'C.R. 7054850701<br>' +
              'شركة بريكسن ذ.م.م' +
            '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</div>' +

    '</body>' +
    '</html>';

    return html;
  },

  /**
   * Renders the 100% Pure English Quotation HTML (ZERO Arabic text).
   * Matches authentic commercial international standards.
   */
  renderEnglishHTML: function(q, items) {
    var subtotalFmt = (parseFloat(q.SubtotalExclVAT) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var vatFmt = (parseFloat(q.VATAmount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var grandTotalFmt = (parseFloat(q.GrandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var itemsRowsHtml = '';
    for (var i = 0; i < items.length; i++) {
      var itm = items[i];
      var areaDisplay = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
      var totalDisplay = itm.lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var rateDisplay = itm.unitRate.toFixed(2) + (itm.isMinimumApplied ? '*' : '');
      var descEn = itm.descriptionEn || ('Supply and installation of ' + (itm.category || 'aluminum') + ' architectural unit.');

      itemsRowsHtml += '<tr>' +
        '<td style="text-align:center; font-weight:bold;">' + (itm.itemCode || (i + 1)) + '</td>' +
        '<td style="text-align:left;">' + descEn + '</td>' +
        '<td style="text-align:center;">' + itm.count + '</td>' +
        '<td style="text-align:center;">' + areaDisplay + ' m²</td>' +
        '<td style="text-align:center;">m²</td>' +
        '<td style="text-align:right;">' + rateDisplay + '</td>' +
        '<td style="text-align:right; font-weight:bold;">' + totalDisplay + '</td>' +
      '</tr>';
    }

    var html = '<!DOCTYPE html>' +
    '<html lang="en" dir="ltr">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>Commercial Quotation - ' + (q.ReferenceNo || '') + '</title>' +
    '<style>' +
    '@page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }' +
    'body { font-family: "Segoe UI", Calibri, Arial, sans-serif; font-size: 10pt; color: #111; line-height: 1.35; margin: 0; padding: 0; }' +
    '.header-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border-bottom: 2px solid #111; padding-bottom: 6px; }' +
    '.company-title { font-size: 18pt; font-weight: bold; color: #000; letter-spacing: 1px; }' +
    '.company-title span { color: #E30613; }' +
    '.meta-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }' +
    '.meta-table td { padding: 4px 6px; border: 1px solid #bbb; }' +
    '.meta-lbl { font-weight: bold; background-color: #f7f9fa; width: 14%; color: #1F4E79; }' +
    '.sec-head { font-size: 10.5pt; font-weight: bold; color: #1F4E79; margin: 10px 0 4px 0; border-bottom: 1.5px solid #1F4E79; padding-bottom: 2px; }' +
    '.basis-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 8.5pt; }' +
    '.basis-table td { padding: 4px 6px; border: 1px solid #ddd; }' +
    '.basis-lbl { font-weight: bold; width: 22%; background-color: #fafafa; }' +
    '.boq-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 8.5pt; }' +
    '.boq-table th { background-color: #1F4E79; color: #fff; padding: 5px 4px; border: 1px solid #1F4E79; text-align: center; }' +
    '.boq-table td { padding: 4px 5px; border: 1px solid #ddd; }' +
    '.terms-box { font-size: 8.5pt; line-height: 1.5; margin-bottom: 10px; background-color: #fbfcff; border: 1px solid #d9e2ec; border-left: 4px solid #1F4E79; padding: 6px 10px; }' +
    '.footer-sign-container { page-break-inside: avoid; break-inside: avoid; margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; width: 100%; }' +
    '</style>' +
    '</head>' +
    '<body>' +

    // Header
    '<table class="header-table">' +
      '<tr>' +
        '<td style="vertical-align:top;">' +
          '<div class="company-title">BRI<span>X</span>EN <span style="font-size:12pt; color:#111;">LLC</span></div>' +
          '<div style="font-size:8.5pt; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>' +
          '<div style="font-size:8.5pt; color:#555;">www.brixenco.com | info@brixenco.com</div>' +
        '</td>' +
        '<td style="text-align:right; vertical-align:top;">' +
          '<div style="font-size:14pt; font-weight:bold; color:#1F4E79;">Commercial Quotation</div>' +
          '<div style="font-size:9pt; color:#666;">Ref: ' + (q.ReferenceNo || '') + '</div>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    // Metadata
    '<table class="meta-table">' +
      '<tr>' +
        '<td class="meta-lbl">Ref.:</td><td style="font-weight:bold;">' + (q.ReferenceNo || '') + '</td>' +
        '<td class="meta-lbl">Date:</td><td>' + (q.Date || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-lbl">To (Client):</td><td style="font-weight:bold;">' + (q.CustomerName || '') + '</td>' +
        '<td class="meta-lbl">Project:</td><td>' + (q.ProjectName || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-lbl">Subject:</td><td>Quotation for Aluminum Doors, Windows, Glazing & Cladding Works</td>' +
        '<td class="meta-lbl">Currency:</td><td>Saudi Riyal (SAR)</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-lbl">Basis:</td><td>Architectural drawings, project BOQ, and site measurements</td>' +
        '<td class="meta-lbl">Pricing Scope:</td><td>Supply, fabrication, transport, and site installation</td>' +
      '</tr>' +
    '</table>' +

    // Technical Basis Table
    '<div class="sec-head">A) TECHNICAL SPECIFICATIONS & BASIS OF DESIGN</div>' +
    '<table class="basis-table">' +
      '<tr><td class="basis-lbl">Aluminum Systems</td><td>Saraya 105mm fixed/hinged windows (1.5mm wall thickness); Saraya 45mm hopper windows (1.5mm wall thickness); Heavy Duty Door Series 100mm (2.0mm wall thickness).</td></tr>' +
      '<tr><td class="basis-lbl">Glazing Specifications</td><td>GL1: 24mm DGU (6mm Clear Temp + 12mm Air Space + 6mm Clear Temp). GL2: 24mm Frosted DGU for bathrooms. GL3: 10mm Clear Tempered Frameless Structural Glass for elevator facade.</td></tr>' +
      '<tr><td class="basis-lbl">Hardware & Accessories</td><td>Genuine Italian mechanical hardware & multi-point locking gear, continuous EPDM weather-stripping rubber gaskets, German GP / WACKER structural silicone.</td></tr>' +
      '<tr><td class="basis-lbl">Measurement Basis</td><td>Areas calculated from overall width x height. Final cutting subject to architectural site verification and approval.</td></tr>' +
    '</table>' +

    // Price Schedule BOQ
    '<div class="sec-head">B) PRICE SCHEDULE (BOQ)</div>' +
    '<table class="boq-table">' +
      '<thead>' +
        '<tr>' +
          '<th style="width:8%;">Item</th>' +
          '<th style="width:48%;">Description / Opening Dimensions</th>' +
          '<th style="width:8%;">Qty.</th>' +
          '<th style="width:12%;">Total Area</th>' +
          '<th style="width:8%;">Unit</th>' +
          '<th style="width:12%;">Rate / SAR</th>' +
          '<th style="width:14%;">Amount / SAR</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        itemsRowsHtml +
        '<tr style="background-color:#f9f9f9;">' +
          '<td colspan="6" style="text-align:right; font-weight:bold;">Total Price (Excluding VAT)</td>' +
          '<td style="text-align:right; font-weight:bold;">SAR ' + subtotalFmt + '</td>' +
        '</tr>' +
        '<tr style="background-color:#f9f9f9;">' +
          '<td colspan="6" style="text-align:right; font-weight:bold;">Value Added Tax (VAT 15%)</td>' +
          '<td style="text-align:right; font-weight:bold;">SAR ' + vatFmt + '</td>' +
        '</tr>' +
        '<tr style="background-color:#eef4fb;">' +
          '<td colspan="6" style="text-align:right; font-weight:bold; font-size:10pt; color:#1F4E79;">Grand Total Including VAT</td>' +
          '<td style="text-align:right; font-weight:bold; font-size:10pt; color:#1F4E79;">SAR ' + grandTotalFmt + '</td>' +
        '</tr>' +
      '</tbody>' +
    '</table>' +

    // Dynamic Commercial Terms (100% English)
    (function() {
      var termsList = (q.selectedTerms || q.terms || []);
      var out = '<div class="sec-head">C) COMMERCIAL TERMS & CONDITIONS</div><div class="terms-box">';
      var count = 0;
      if (termsList && termsList.length > 0) {
        termsList.forEach(function(t) {
          if (t.isSelected !== false) {
            var title = (t.titleEn || t.titleAr || '').replace(/[\u0600-\u06FF]/g, '').trim();
            var text = (t.textEn || t.textAr || (typeof t === 'string' ? t : '')).replace(/[\u0600-\u06FF]/g, '').trim();
            if (text) {
              out += '• ' + (title ? '<b>' + title + ':</b> ' : '') + text + '<br>';
              count++;
            }
          }
        });
      }
      if (count === 0) {
        out += '• <b>Offer Validity:</b> ' + (q.ValidityDays || 3) + ' calendar days from issuance date.<br>' +
          '• <b>Manufacturing & Delivery:</b> ' + (q.DeliveryDays || 30) + ' calendar days for fabrication, and ' + (q.InstallDays || 10) + ' calendar days for site installation.<br>' +
          '• <b>Payment Terms:</b> 50% advance upon contract signing; 45% when materials are ready at factory prior to delivery; 5% upon start of site installation.<br>' +
          '• <b>Minimum Charge Rule (*):</b> Asterisk (*) indicates application of statutory minimum price of SAR 650.00 for units < 1.0 m².<br>' +
          '• <b>Authorized Bank Account:</b> Al-Rajhi Bank | Beneficiary: BRIXEN LLC | IBAN: <b>SA4080000510608010602103</b>';
      }
      out += '</div>';
      return out;
    })() +

    // Sign-off & Stamp
    '<div class="footer-sign-container">' +
      '<table style="width:100%; border-collapse:collapse;">' +
        '<tr>' +
          '<td style="vertical-align:bottom;">' +
            '<div style="font-size:9.5pt; color:#333;">Thank you for the opportunity to submit our offer. We look forward to working with you.</div>' +
            '<div style="font-weight:bold; font-size:10.5pt; color:#1F4E79; margin-top:4px;">BRIXEN LLC — Architectural Aluminum & Glazing</div>' +
            '<div style="font-size:8pt; color:#666;">Commercial Registration: 7054850701 | Riyadh, Kingdom of Saudi Arabia</div>' +
          '</td>' +
          '<td style="text-align:right; vertical-align:middle; width:220px;">' +
            '<div style="border:2px solid #1F4E79; color:#1F4E79; padding:6px 12px; text-align:center; font-size:8.5pt; font-weight:bold; background-color:#f9fbfe; border-radius:4px; display:inline-block;">' +
              'BRIXEN LLC<br>' +
              'C.R. 7054850701<br>' +
              'AUTHORIZED QUOTATION' +
            '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</div>' +

    '</body>' +
    '</html>';

    return html;
  },

  /**
   * Renders the Dual Language (Bilingual Arabic + English) Quotation HTML.
   * Features side-by-side bilingual headings, dual descriptions, and dual terms.
   */
  renderBilingualHTML: function(q, items) {
    var subtotalFmt = (parseFloat(q.SubtotalExclVAT) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var vatFmt = (parseFloat(q.VATAmount) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var grandTotalFmt = (parseFloat(q.GrandTotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    var itemsRowsHtml = '';
    for (var i = 0; i < items.length; i++) {
      var itm = items[i];
      var areaDisplay = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
      var totalDisplay = itm.lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var rateDisplay = itm.unitRate.toFixed(2) + (itm.isMinimumApplied ? '*' : '');
      var descAr = itm.descriptionAr || '';
      var descEn = itm.descriptionEn || '';

      itemsRowsHtml += '<tr>' +
        '<td style="text-align:center; font-weight:bold;">' + (itm.itemCode || (i + 1)) + '</td>' +
        '<td style="text-align:right;">' +
          '<div style="font-weight:600; color:#111;">' + descAr + '</div>' +
          '<div style="font-size:8pt; color:#475569; direction:ltr; text-align:left;">' + descEn + '</div>' +
        '</td>' +
        '<td style="text-align:center;">' + itm.count + '</td>' +
        '<td style="text-align:center;">' + areaDisplay + ' m²</td>' +
        '<td style="text-align:center;">م² / m²</td>' +
        '<td style="text-align:right;">' + rateDisplay + '</td>' +
        '<td style="text-align:right; font-weight:bold;">' + totalDisplay + '</td>' +
      '</tr>';
    }

    var html = '<!DOCTYPE html>' +
    '<html lang="ar" dir="rtl">' +
    '<head>' +
    '<meta charset="utf-8">' +
    '<title>عرض سعر تجاري / Commercial Quotation - ' + (q.ReferenceNo || '') + '</title>' +
    '<style>' +
    '@page { size: A4 portrait; margin: 12mm 15mm 15mm 15mm; }' +
    'body { font-family: "Segoe UI", Tahoma, Calibri, Arial, sans-serif; font-size: 10pt; color: #111; line-height: 1.35; margin: 0; padding: 0; }' +
    '.header-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; }' +
    '.company-title { font-size: 17pt; font-weight: bold; color: #000; letter-spacing: 1px; }' +
    '.company-title span { color: #E30613; }' +
    '.meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 9pt; }' +
    '.meta-grid td { padding: 4px 6px; border: 1px solid #ccc; }' +
    '.meta-label { font-weight: bold; background-color: #f8fafc; width: 18%; color: #1F4E79; }' +
    '.sec-title { font-size: 10.5pt; font-weight: bold; color: #1F4E79; margin: 10px 0 4px 0; border-bottom: 1px solid #1F4E79; padding-bottom: 2px; display:flex; justify-content:space-between; }' +
    '.specs-box { font-size: 8.5pt; line-height: 1.5; margin-bottom: 10px; background-color: #fafafa; border: 1px solid #eee; padding: 6px 10px; }' +
    '.boq-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 8.5pt; }' +
    '.boq-table th { background-color: #1F4E79; color: #fff; padding: 5px 4px; border: 1px solid #1F4E79; text-align: center; }' +
    '.boq-table td { padding: 4px 5px; border: 1px solid #ddd; }' +
    '.summary-table { width: 50%; margin-right: auto; margin-left: 0; border-collapse: collapse; margin-bottom: 10px; font-size: 9.5pt; }' +
    '.summary-table td { padding: 4px 8px; border: 1px solid #ccc; }' +
    '.summary-label { font-weight: bold; background-color: #f8fafc; }' +
    '.terms-list { font-size: 8.5pt; line-height: 1.5; margin: 0; padding-right: 18px; }' +
    '.footer-sign-container { page-break-inside: avoid; break-inside: avoid; margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; width: 100%; }' +
    '</style>' +
    '</head>' +
    '<body>' +

    // Header
    '<table class="header-table">' +
      '<tr>' +
        '<td style="vertical-align:top;">' +
          '<div class="company-title">BRI<span>X</span>EN <span style="font-size:12pt; color:#111;">LLC</span></div>' +
          '<div style="font-size:8.5pt; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>' +
          '<div style="font-size:8.5pt; color:#555;">www.brixenco.com | info@brixenco.com</div>' +
        '</td>' +
        '<td style="text-align:left; vertical-align:top;">' +
          '<div style="font-size:14pt; font-weight:bold; color:#1F4E79;">COMMERCIAL QUOTATION / عرض سعر معتمد</div>' +
          '<div style="font-size:9pt; color:#666;">Ref: ' + (q.ReferenceNo || '') + '</div>' +
        '</td>' +
      '</tr>' +
    '</table>' +

    // Metadata
    '<table class="meta-grid">' +
      '<tr>' +
        '<td class="meta-label">المرجع / Ref.:</td><td style="font-weight:bold;">' + (q.ReferenceNo || '') + '</td>' +
        '<td class="meta-label">التاريخ / Date:</td><td>' + (q.Date || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">إلى / Client:</td><td style="font-weight:bold;">' + (q.CustomerName || '') + '</td>' +
        '<td class="meta-label">المشروع / Project:</td><td>' + (q.ProjectName || '') + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">الموضوع / Subject:</td><td>أعمال الألمنيوم والزجاج والكلادينج / Aluminum & Glazing Works</td>' +
        '<td class="meta-label">العملة / Currency:</td><td>الريال السعودي / Saudi Riyal (SAR)</td>' +
      '</tr>' +
      '<tr>' +
        '<td class="meta-label">الأساس / Basis:</td><td>مخططات وجداول المشروع / Project Drawings & Site Verification</td>' +
        '<td class="meta-label">التسعير / Scope:</td><td>التوريد والتصنيع والتركيب / Supply, Fabrication & Installation</td>' +
      '</tr>' +
    '</table>' +

    // Specs
    '<div class="sec-title"><span>أولاً: المواصفات الفنية المعتمدة</span><span style="font-size:9pt; font-weight:normal; direction:ltr;">A) TECHNICAL SPECIFICATIONS</span></div>' +
    '<div class="specs-box">' +
      '• <b>الألمنيوم / Aluminum:</b> قطاع القلاب سرايا 45 مم للحمامات، قطاع النوافذ 105 مم، قطاع الأبواب 100 مم سماكة 2 مم (Saraya 105mm, 45mm, 100mm door series).<br>' +
      '• <b>الزجاج / Glazing:</b> GL1: 24 مم دبل شفاف مقوى (24mm Clear DGU). GL2: 24 مم دبل مثلج مقوى (24mm Frosted DGU). GL3: 10 مم زجاج مصعد فرملس مقوى.<br>' +
      '• <b>الإكسسوارات والسيليكون / Hardware:</b> إكسسوارات إيطالية معتمدة، ربر EPDM، سيليكون ألماني أصلي GP / WACKER.' +
    '</div>' +

    // BOQ
    '<div class="sec-title"><span>ثانياً: جدول الكميات والأسعار (BOQ)</span><span style="font-size:9pt; font-weight:normal; direction:ltr;">B) PRICE SCHEDULE</span></div>' +
    '<table class="boq-table">' +
      '<thead>' +
        '<tr>' +
          '<th style="width:7%;">البند / Item</th>' +
          '<th style="width:45%;">الوصف الفني والمقاسات / Description & Dimensions</th>' +
          '<th style="width:7%;">العدد / Qty</th>' +
          '<th style="width:11%;">المساحة / Area</th>' +
          '<th style="width:8%;">الوحدة / Unit</th>' +
          '<th style="width:10%;">السعر / Rate</th>' +
          '<th style="width:12%;">الإجمالي / Total</th>' +
        '</tr>' +
      '</thead>' +
      '<tbody>' +
        itemsRowsHtml +
      '</tbody>' +
    '</table>' +

    // Financials
    '<table class="summary-table">' +
      '<tr><td class="summary-label">إجمالي البنود / Subtotal (Excl. VAT):</td><td style="text-align:right;">' + subtotalFmt + ' SAR</td></tr>' +
      '<tr><td class="summary-label">ضريبة القيمة المضافة / VAT (15%):</td><td style="text-align:right;">' + vatFmt + ' SAR</td></tr>' +
      '<tr style="background-color:#eef4fb;"><td class="summary-label" style="font-size:10pt; color:#1F4E79;">الإجمالي شامل الضريبة / Grand Total:</td><td style="text-align:right; font-size:10pt; font-weight:bold; color:#1F4E79;">' + grandTotalFmt + ' SAR</td></tr>' +
    '</table>' +

    // Dynamic Terms
    (function() {
      var termsList = (q.selectedTerms || q.terms || []);
      var out = '<div class="sec-title"><span>ثالثاً: الشروط التجارية</span><span style="font-size:9pt; font-weight:normal; direction:ltr;">C) COMMERCIAL TERMS</span></div><ul class="terms-list">';
      var count = 0;
      if (termsList && termsList.length > 0) {
        termsList.forEach(function(t) {
          if (t.isSelected !== false) {
            var titleAr = t.titleAr || '';
            var titleEn = t.titleEn || '';
            var textAr = t.textAr || '';
            var textEn = t.textEn || '';
            var titlePart = (titleAr || titleEn) ? ('<b>' + titleAr + (titleEn ? ' / ' + titleEn : '') + ':</b> ') : '';
            out += '<li>' + titlePart + textAr + (textEn ? '<div style="font-size:9pt; color:#475569; direction:ltr;">' + textEn + '</div>' : '') + '</li>';
            count++;
          }
        });
      }
      if (count === 0) {
        out += '<li><b>صلاحية العرض / Validity:</b> ' + (q.ValidityDays || 3) + ' أيام تقويمية من تاريخ صدور العرض (3 calendar days from issuance date).</li>' +
          '<li><b>التوريد والتركيب / Supply & Install:</b> ' + (q.DeliveryDays || 30) + ' يوماً للتوريد بالمصنع، و' + (q.InstallDays || 10) + ' أيام للتركيب بالموقع.</li>' +
          '<li><b>شروط الدفع / Payment Terms:</b> 50% دفعة مقدمة، و45% عند جاهزية المواد بالمصنع، و5% عند البدء بالتركيب.</li>' +
          '<li><b>الحد الأدنى (*) / Minimum Charge:</b> علامة (*) تعني تطبيق الحد الأدنى 650 ريال للوحدة التي تقل عن 1 م² (Min. SAR 650 for < 1.0 m²).</li>' +
          '<li><b>الحساب البنكي / Bank Details:</b> مصرف الراجحي (Al-Rajhi Bank) - IBAN: <b>SA4080000510608010602103</b> باسم شركة بريكسن.</li>';
      }
      out += '</ul>';
      return out;
    })() +

    // Footer & Sign-off
    '<div class="footer-sign-container">' +
      '<table style="width:100%; border-collapse:collapse;">' +
        '<tr>' +
          '<td style="vertical-align:bottom;">' +
            '<div style="font-size:9.5pt;">شاكرين لكم حسن تعاونكم / Thank you for your business.</div>' +
            '<div style="font-weight:bold; font-size:11pt; color:#1F4E79; margin-top:4px;">شركة بريكسن ذات مسؤولية محدودة / BRIXEN LLC</div>' +
            '<div style="font-size:8.5pt; color:#666;">C.R. 7054850701 | س.ت 7054850701 - الرياض</div>' +
          '</td>' +
          '<td style="text-align:left; vertical-align:middle; width:220px;">' +
            '<div style="border:2px solid #1F4E79; color:#1F4E79; padding:6px 12px; text-align:center; font-size:8.5pt; font-weight:bold; background-color:#f9fbfe; border-radius:4px;">' +
              'BRIXEN LLC<br>' +
              'C.R. 7054850701<br>' +
              'عرض سعر معتمد' +
            '</div>' +
          '</td>' +
        '</tr>' +
      '</table>' +
    '</div>' +

    '</body>' +
    '</html>';

    return html;
  }
};


// ============================================================================
// SECTION 5: AUTOMATED SERVER-SIDE TEST SUITE
// ============================================================================

/**
 * BRIXEN Automated Quotation Management Platform
 * File: TestSuite.gs
 * Description: Comprehensive automated server-side test suite validating calculations, schema, and rules.
 */

var TestSuite = {

  runAllTests: function() {
    var results = {
      timestamp: new Date().toISOString(),
      totalTests: 0,
      passed: 0,
      failed: 0,
      details: []
    };

    function run(name, fn) {
      results.totalTests++;
      try {
        fn();
        results.passed++;
        results.details.push({ test: name, status: 'PASSED', error: null });
      } catch (e) {
        results.failed++;
        results.details.push({ test: name, status: 'FAILED', error: e.message });
      }
    }

    // Test 1: Area calculation in meters
    run('Area Calculation in Meters (W=2.0, H=3.0, Qty=2)', function() {
      var res = QuotationService.calculateArea(2.0, 3.0, 2, 'm');
      if (res.unitAreaM2 !== 6.0) throw new Error('Expected unitArea 6.0, got ' + res.unitAreaM2);
      if (res.totalAreaM2 !== 12.0) throw new Error('Expected totalArea 12.0, got ' + res.totalAreaM2);
    });

    // Test 2: Area calculation in millimeters
    run('Area Calculation in Millimeters (W=1000, H=2000, Qty=1)', function() {
      var res = QuotationService.calculateArea(1000, 2000, 1, 'mm');
      if (res.unitAreaM2 !== 2.0) throw new Error('Expected unitArea 2.0, got ' + res.unitAreaM2);
      if (res.totalAreaM2 !== 2.0) throw new Error('Expected totalArea 2.0, got ' + res.totalAreaM2);
    });

    // Test 3: Rule (*) Minimum charge below 1 m² (W=0.40, H=0.60 -> 0.24 m²)
    run('Rule (*) Minimum Charge for Opening < 1.0 m²', function() {
      var item = {
        itemCode: 'W4', category: 'Windows', width: 0.40, height: 0.60, count: 1, unit: 'm', unitRate: 650.00
      };
      var res = QuotationService.calculateLineItem(item);
      if (!res.isMinimumApplied) throw new Error('Rule (*) should be triggered for area 0.24 m²');
      if (res.lineTotal !== 650.00) throw new Error('Expected line total SAR 650.00, got ' + res.lineTotal);
    });

    // Test 4: Rule (*) Boundary Case at exactly 1.0 m² (W=1.0, H=1.0)
    run('Rule (*) Boundary Case at exactly 1.0 m² (No minimum surcharge)', function() {
      var item = {
        itemCode: 'W-TEST', category: 'Windows', width: 1.00, height: 1.00, count: 1, unit: 'm', unitRate: 650.00
      };
      var res = QuotationService.calculateLineItem(item);
      if (res.isMinimumApplied) throw new Error('Rule (*) should NOT trigger for exactly 1.0 m²');
      if (res.lineTotal !== 650.00) throw new Error('Expected line total 650.00, got ' + res.lineTotal);
    });

    // Test 5: Rule (*) with Multiple Units (W=0.50, H=0.80 = 0.40 m², Qty=3)
    run('Rule (*) Multi-Unit Minimum Application (Qty=3 x SAR 650)', function() {
      var item = {
        itemCode: 'W-MULTI', category: 'Windows', width: 0.50, height: 0.80, count: 3, unit: 'm', unitRate: 650.00
      };
      var res = QuotationService.calculateLineItem(item);
      if (!res.isMinimumApplied) throw new Error('Rule (*) should be triggered');
      if (res.lineTotal !== 1950.00) throw new Error('Expected 3 x 650 = 1950.00, got ' + res.lineTotal);
    });

    // Test 6: Authentic Khobar Villa 19-Item Mathematical Verification
    run('Khobar Villa 19-Item BOQ Exact Verification (Subtotal SAR 53,989.52)', function() {
      var khobarItems = [
        { itemCode: 'D1', category: 'Doors', width: 1.025, height: 2.20, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'D2', category: 'Doors', width: 1.45, height: 2.40, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'D3', category: 'Doors', width: 1.39, height: 2.20, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'D4', category: 'Doors', width: 1.38, height: 2.90, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W1', category: 'Windows', width: 3.00, height: 2.80, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W2', category: 'Windows', width: 2.70, height: 2.90, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W3', category: 'Windows', width: 2.90, height: 3.10, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W4', category: 'Windows', width: 0.40, height: 0.60, count: 1, unit: 'm', unitRate: 650.00 }, // min
        { itemCode: 'W5', category: 'Windows', width: 0.60, height: 0.80, count: 1, unit: 'm', unitRate: 650.00 }, // min
        { itemCode: 'W6', category: 'Windows', width: 1.40, height: 1.10, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W7', category: 'Windows', width: 0.96, height: 1.20, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W8', category: 'Windows', width: 0.78, height: 1.82, count: 5, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W9', category: 'Windows', width: 0.67, height: 1.24, count: 1, unit: 'm', unitRate: 650.00 }, // min
        { itemCode: 'W10', category: 'Windows', width: 0.66, height: 1.62, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W11', category: 'Windows', width: 0.675, height: 1.81, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W12', category: 'Windows', width: 2.36, height: 2.30, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W13', category: 'Windows', width: 2.30, height: 3.21, count: 1, unit: 'm', unitRate: 650.00 },
        { itemCode: 'W14', category: 'Windows', width: 0.66, height: 0.76, count: 1, unit: 'm', unitRate: 650.00 }, // min
        { itemCode: 'CL', category: 'Cladding', width: 7.05, height: 2.00, count: 1, unit: 'm', billedArea: 15.00, unitRate: 350.00 },
        { itemCode: 'EL', category: 'Elevator', width: 0, height: 0, count: 1, unit: 'm', billedArea: 15.00, unitRate: 350.00 }
      ];

      var totals = QuotationService.calculateQuotationTotals(khobarItems, 0.15);
      if (Math.abs(totals.subtotal - 53989.52) > 0.05) {
        throw new Error('Subtotal discrepancy! Expected 53989.52, got ' + totals.subtotal);
      }
      if (Math.abs(totals.vatAmount - 8098.43) > 0.05) {
        throw new Error('VAT discrepancy! Expected 8098.43, got ' + totals.vatAmount);
      }
      if (Math.abs(totals.grandTotal - 62087.95) > 0.05) {
        throw new Error('Grand Total discrepancy! Expected 62087.95, got ' + totals.grandTotal);
      }
      if (totals.minimumSurchargeCount !== 4) {
        throw new Error('Expected 4 items with minimum surcharge, got ' + totals.minimumSurchargeCount);
      }
    });

    // Test 7: VAT Calculation Precision (15%)
    run('VAT 15% Calculation Precision', function() {
      var totals = QuotationService.calculateQuotationTotals([
        { width: 1, height: 1, count: 1, unitRate: 1000, billedArea: 1 }
      ], 0.15);
      if (totals.subtotal !== 1000.00) throw new Error('Subtotal error');
      if (totals.vatAmount !== 150.00) throw new Error('VAT error');
      if (totals.grandTotal !== 1150.00) throw new Error('Grand Total error');
    });

    // Test 8: Concurrency Locking and Unique Reference Pattern
    run('Reference Number Pattern & Structure', function() {
      var ref = QuotationService.generateReferenceNumber('KHB', new Date(2026, 9, 27), 'AR');
      if (ref.indexOf('BRX/QT/KHB/2710/2026') !== 0) {
        throw new Error('Unexpected reference format: ' + ref);
      }
    });

    // Test 9: HTML Document Rendering (Arabic)
    run('Arabic HTML Quotation Rendering Integrity', function() {
      var dummyQuote = {
        ReferenceNo: 'BRX/QT/TEST/0101/2026',
        Date: '2026-10-27',
        CustomerName: 'Test Client',
        ProjectName: 'Test Project',
        SubtotalExclVAT: 10000,
        VATAmount: 1500,
        GrandTotal: 11500
      };
      var dummyItems = [
        { itemCode: '1', descriptionAr: 'شباك تيست', count: 1, calculatedAreaM2: 2.0, billedAreaM2: 2.0, unitRate: 5000, lineTotal: 10000 }
      ];
      var html = DocumentGenerator.renderArabicHTML(dummyQuote, dummyItems);
      if (html.indexOf('BRX/QT/TEST/0101/2026') === -1) throw new Error('Missing reference in rendered HTML');
      if (html.indexOf('7054850701') === -1) throw new Error('Missing C.R. number in rendered HTML');
      if (html.indexOf('SA4080000510608010602103') === -1) throw new Error('Missing IBAN in rendered HTML');
    });

    // Test 10: HTML Document Rendering (English)
    run('English HTML Quotation Rendering Integrity', function() {
      var dummyQuote = {
        ReferenceNo: 'BRX/QT/KRIS/0909/2026',
        Date: '09 September 2026',
        CustomerName: 'Eng. Kris',
        ProjectName: 'Aluminum Doors Works',
        SubtotalExclVAT: 40000,
        VATAmount: 6000,
        GrandTotal: 46000
      };
      var dummyItems = [
        { itemCode: '1', descriptionEn: 'Turn & Tilt window', count: 1, calculatedAreaM2: 3.07, billedAreaM2: 3.07, unitRate: 1073.84, lineTotal: 3296.69 }
      ];
      var html = DocumentGenerator.renderEnglishHTML(dummyQuote, dummyItems);
      if (html.indexOf('BRX/QT/KRIS/0909/2026') === -1) throw new Error('Missing reference in rendered HTML');
      if (html.indexOf('Commercial Quotation') === -1) throw new Error('Missing header title in English HTML');
    });

    return results;
  }
};


// ============================================================================
// SECTION 6: WEB APP CONTROLLER, REST DISPATCHER & RPC BRIDGES
// ============================================================================

/**
 * Serves the HTML frontend or dispatches GET REST API calls.
 */
function doGet(e) {
  e = e || { parameter: {} };
  var action = e.parameter.action;

  // Handle API GET requests
  if (action) {
    try {
      var data = handleApiGet(action, e.parameter);
      return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
                           .setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
                           .setMimeType(ContentService.MimeType.JSON);
    }
  }

  // Serve Single-Page Application (HTML Service)
  // If 'index.html' exists as a separate template, evaluate it; otherwise, serve embedded SPA!
  try {
    var template = HtmlService.createTemplateFromFile('index');
    return template.evaluate()
                   .setTitle(CONFIG.APP_NAME)
                   .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
                   .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (templateErr) {
    return HtmlService.createHtmlOutput(getEmbeddedStandaloneApp())
                      .setTitle(CONFIG.APP_NAME)
                      .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
                      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Handles incoming POST requests (JSON payloads) for remote integrations.
 */
function doPost(e) {
  try {
    var raw = e.postData ? e.postData.contents : '{}';
    var req = JSON.parse(raw);
    var action = req.action;
    var payload = req.payload || {};
    var user = req.user || 'API_USER';

    var result = handleApiPost(action, payload, user);
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: result }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Dispatches API GET actions.
 */
function handleApiGet(action, params) {
  switch (action) {
    case 'init':
      return initializeDatabase();
    case 'getDashboard':
      return getLiveDashboardMetrics();
    case 'getCustomers':
      return getSheetDataObjects('Customers');
    case 'getProjects':
      return getSheetDataObjects('Projects');
    case 'getPriceList':
      return getSheetDataObjects('PriceList');
    case 'getTechnicalSpecs':
      return getSheetDataObjects('TechnicalSpecifications');
    case 'getCommercialTerms':
      return getSheetDataObjects('CommercialTerms');
    case 'getQuotations':
      return getSheetDataObjects('Quotations');
    case 'getQuotationDetails':
      return apiGetQuotationDetails(params.quotationId);
    case 'getSettings':
      return getSheetDataObjects('Settings');
    case 'runTestSuite':
      return TestSuite.runAllTests();
    default:
      throw new Error('Unknown GET action: ' + action);
  }
}

/**
 * Dispatches API POST actions.
 */
function handleApiPost(action, payload, user) {
  switch (action) {
    case 'issueQuotation':
      return QuotationService.issueQuotation(payload, user);
    case 'calculateQuotation':
      return QuotationService.calculateQuotationTotals(payload.items, payload.vatRate, CONFIG.BUSINESS_RULES.MIN_CHARGE_RULE);
    case 'saveCustomer':
      return apiSaveCustomer(payload, user);
    case 'saveProject':
      return apiSaveProject(payload, user);
    case 'savePriceListItem':
      return apiSavePriceListItem(payload, user);
    case 'saveSetting':
      return apiSaveSetting(payload.key, payload.value, user);
    default:
      throw new Error('Unknown POST action: ' + action);
  }
}

// =========================================================================
// RPC Bridges for google.script.run (Client-Server direct invocation)
// =========================================================================

function apiInitializeDatabase() {
  return initializeDatabase();
}

function apiGetDashboard() {
  return getLiveDashboardMetrics();
}

function apiGetCustomers() {
  return getSheetDataObjects('Customers');
}

function apiSaveCustomer(data, user) {
  if (!data.NameAr && !data.NameEn) throw new Error('Customer Name is required.');
  var custId = data.CustomerID || ('CUST-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  var record = {
    CustomerID: custId,
    NameAr: data.NameAr || '',
    NameEn: data.NameEn || '',
    ContactPerson: data.ContactPerson || '',
    Phone: data.Phone || '',
    Email: data.Email || '',
    City: data.City || '',
    Address: data.Address || '',
    CreatedAt: new Date().toISOString(),
    CreatedBy: user || 'USER'
  };
  appendSheetRow('Customers', record);
  logAuditEvent('CREATE_CUSTOMER', 'Customer', custId, 'SUCCESS', record, user);
  return record;
}

function apiGetProjects(customerId) {
  var list = getSheetDataObjects('Projects');
  if (customerId) {
    return list.filter(function(p) { return p.CustomerID === customerId; });
  }
  return list;
}

function apiSaveProject(data, user) {
  if (!data.ProjectNameAr && !data.ProjectNameEn) throw new Error('Project Name is required.');
  var projId = data.ProjectID || ('PROJ-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  var record = {
    ProjectID: projId,
    CustomerID: data.CustomerID || '',
    ProjectNameAr: data.ProjectNameAr || '',
    ProjectNameEn: data.ProjectNameEn || '',
    Location: data.Location || '',
    ScopeType: data.ScopeType || 'Residential',
    Status: 'Active',
    CreatedAt: new Date().toISOString()
  };
  appendSheetRow('Projects', record);
  logAuditEvent('CREATE_PROJECT', 'Project', projId, 'SUCCESS', record, user);
  return record;
}

function apiGetPriceList() {
  return getSheetDataObjects('PriceList');
}

function apiSavePriceListItem(data, user) {
  if (!data.SystemNameAr && !data.SystemNameEn) throw new Error('System Name is required.');
  var sysId = data.SystemID || ('SYS-' + Utilities.getUuid().substring(0, 6).toUpperCase());
  var record = {
    SystemID: sysId,
    Category: data.Category || 'General',
    SystemNameAr: data.SystemNameAr || '',
    SystemNameEn: data.SystemNameEn || '',
    DefaultGlass: data.DefaultGlass || '',
    Unit: data.Unit || 'm²',
    BaseRateSAR: parseFloat(data.BaseRateSAR) || 0,
    MinChargeSAR: parseFloat(data.MinChargeSAR) || 650.00,
    IsActive: data.IsActive !== false,
    EffectiveDate: data.EffectiveDate || new Date().toISOString().substring(0, 10)
  };
  appendSheetRow('PriceList', record);
  logAuditEvent('SAVE_PRICE_ITEM', 'PriceList', sysId, 'SUCCESS', record, user);
  return record;
}

function apiGetQuotations() {
  return getSheetDataObjects('Quotations');
}

function apiGetQuotationDetails(quotationId) {
  var quotes = getSheetDataObjects('Quotations');
  var header = null;
  for (var i = 0; i < quotes.length; i++) {
    if (quotes[i].QuotationID === quotationId || quotes[i].ReferenceNo === quotationId) {
      header = quotes[i];
      break;
    }
  }
  if (!header) throw new Error('Quotation not found: ' + quotationId);

  var allItems = getSheetDataObjects('QuotationItems');
  var items = allItems.filter(function(itm) { return itm.QuotationID === header.QuotationID; });

  return { header: header, items: items };
}

function apiCalculateQuotation(items, vatRate) {
  return QuotationService.calculateQuotationTotals(items, vatRate, CONFIG.BUSINESS_RULES.MIN_CHARGE_RULE);
}

function apiIssueQuotation(payload) {
  return QuotationService.issueQuotation(payload, 'SESSION_USER');
}

function apiGetSettings() {
  return getSheetDataObjects('Settings');
}

function apiSaveSetting(key, val, user) {
  var ss = getDatabaseSpreadsheet();
  var sheet = ss.getSheetByName('Settings');
  if (!sheet) throw new Error('Settings sheet not found.');

  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === key) {
      sheet.getRange(r + 1, 2).setValue(val);
      sheet.getRange(r + 1, 5).setValue(new Date().toISOString());
      sheet.getRange(r + 1, 6).setValue(user || 'ADMIN');
      logAuditEvent('UPDATE_SETTING', 'Settings', key, 'SUCCESS', { oldValue: data[r][1], newValue: val }, user);
      return { success: true, key: key, value: val };
    }
  }

  sheet.appendRow([key, val, 'Custom', 'User-defined setting', new Date().toISOString(), user || 'ADMIN']);
  logAuditEvent('CREATE_SETTING', 'Settings', key, 'SUCCESS', { value: val }, user);
  return { success: true, key: key, value: val };
}

function apiRunTestSuite() {
  return TestSuite.runAllTests();
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Embedded Standalone Single-Page Application HTML.
 * Enables zero-dependency Web App deployment without creating a separate index.html file in Apps Script.
 */
function getEmbeddedStandaloneApp() {
  return "<!DOCTYPE html>\n<html lang=\"ar\" dir=\"rtl\">\n<head>\n  <meta charset=\"utf-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">\n  <title>BRIXEN Automated Quotation Management Platform</title>\n  <style>\n/* ==========================================================================\n   BRIXEN Automated Quotation Management Platform \u2014 Stylesheet\n   Design System: Corporate Engineering (Jet Black, Scarlet Red, Steel Navy)\n   ========================================================================== */\n\n:root {\n  --primary-black: #111827;\n  --secondary-black: #1F2937;\n  --accent-red: #E30613;\n  --accent-red-hover: #C50410;\n  --corporate-navy: #1F4E79;\n  --secondary-navy: #2F5597;\n  --navy-light: #EEF4FB;\n  --bg-page: #F8FAFC;\n  --bg-surface: #FFFFFF;\n  --bg-card: #FFFFFF;\n  --text-main: #1E293B;\n  --text-muted: #64748B;\n  --text-light: #94A3B8;\n  --border-color: #E2E8F0;\n  --border-focus: #1F4E79;\n  --success: #10B981;\n  --success-bg: #ECFDF5;\n  --warning: #F59E0B;\n  --warning-bg: #FFFBEB;\n  --danger: #EF4444;\n  --danger-bg: #FEF2F2;\n  --info: #3B82F6;\n  --info-bg: #EFF6FF;\n  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);\n  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);\n  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);\n  --radius-sm: 6px;\n  --radius-md: 8px;\n  --radius-lg: 12px;\n  --font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;\n  --header-height: 64px;\n  --sidebar-width: 260px;\n}\n\n/* RTL / LTR Core */\n* {\n  box-sizing: border-box;\n  margin: 0;\n  padding: 0;\n}\n\nbody {\n  font-family: var(--font-family);\n  background-color: var(--bg-page);\n  color: var(--text-main);\n  line-height: 1.5;\n  font-size: 14px;\n  min-height: 100vh;\n  display: flex;\n  flex-direction: column;\n}\n\n/* Top Navigation Bar */\n.top-nav {\n  height: var(--header-height);\n  background-color: var(--bg-surface);\n  border-bottom: 1px solid var(--border-color);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 0 24px;\n  position: sticky;\n  top: 0;\n  z-index: 50;\n  box-shadow: var(--shadow-sm);\n}\n\n.brand-container {\n  display: flex;\n  align-items: center;\n  gap: 16px;\n}\n\n.brand-logo {\n  height: 38px;\n  width: auto;\n  display: block;\n}\n\n.brand-divider {\n  width: 1px;\n  height: 28px;\n  background-color: var(--border-color);\n}\n\n.system-title-box {\n  display: flex;\n  flex-direction: column;\n}\n\n.system-title {\n  font-size: 15px;\n  font-weight: 700;\n  color: var(--primary-black);\n  letter-spacing: 0.2px;\n}\n\n.system-subtitle {\n  font-size: 11px;\n  color: var(--text-muted);\n}\n\n.nav-actions {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.badge {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 10px;\n  border-radius: 9999px;\n  font-size: 11.5px;\n  font-weight: 600;\n}\n\n.badge-connected {\n  background-color: var(--success-bg);\n  color: #065F46;\n  border: 1px solid #A7F3D0;\n}\n\n.badge-warning {\n  background-color: var(--warning-bg);\n  color: #92400E;\n  border: 1px solid #FDE68A;\n}\n\n.badge-danger {\n  background-color: var(--danger-bg);\n  color: #991B1B;\n  border: 1px solid #FECACA;\n}\n\n.badge-dot {\n  width: 7px;\n  height: 7px;\n  border-radius: 50%;\n  background-color: currentColor;\n}\n\n/* Main Layout Grid */\n.app-container {\n  display: flex;\n  flex: 1;\n  min-height: calc(100vh - var(--header-height));\n}\n\n/* Sidebar Navigation */\n.sidebar {\n  width: var(--sidebar-width);\n  background-color: var(--bg-surface);\n  border-right: 1px solid var(--border-color);\n  padding: 20px 12px;\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n}\n\n[dir=\"rtl\"] .sidebar {\n  border-right: none;\n  border-left: 1px solid var(--border-color);\n}\n\n.nav-menu {\n  list-style: none;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n\n.nav-item {\n  width: 100%;\n}\n\n.nav-link {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  padding: 10px 14px;\n  border-radius: var(--radius-md);\n  color: var(--text-muted);\n  text-decoration: none;\n  font-size: 13.5px;\n  font-weight: 500;\n  transition: all 0.15s ease-in-out;\n  cursor: pointer;\n  border: none;\n  background: transparent;\n  width: 100%;\n  text-align: inherit;\n}\n\n.nav-link:hover {\n  background-color: #F1F5F9;\n  color: var(--text-main);\n}\n\n.nav-link.active {\n  background-color: var(--navy-light);\n  color: var(--corporate-navy);\n  font-weight: 700;\n}\n\n.nav-icon {\n  width: 18px;\n  height: 18px;\n  flex-shrink: 0;\n}\n\n.nav-pill {\n  margin-left: auto;\n  font-size: 10.5px;\n  background-color: var(--corporate-navy);\n  color: #FFF;\n  padding: 2px 7px;\n  border-radius: 10px;\n}\n\n[dir=\"rtl\"] .nav-pill {\n  margin-left: 0;\n  margin-right: auto;\n}\n\n/* Main Workspace Content Area */\n.main-content {\n  flex: 1;\n  padding: 28px 32px;\n  overflow-y: auto;\n}\n\n/* View Sections */\n.view-section {\n  display: none;\n  animation: fadeIn 0.2s ease-in-out;\n}\n\n.view-section.active {\n  display: block;\n}\n\n@keyframes fadeIn {\n  from { opacity: 0; transform: translateY(4px); }\n  to { opacity: 1; transform: translateY(0); }\n}\n\n/* Header Area for Views */\n.view-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 24px;\n  flex-wrap: wrap;\n  gap: 16px;\n}\n\n.view-title-group h1 {\n  font-size: 22px;\n  font-weight: 700;\n  color: var(--primary-black);\n}\n\n.view-title-group p {\n  font-size: 13px;\n  color: var(--text-muted);\n  margin-top: 2px;\n}\n\n/* Cards & Surfaces */\n.card {\n  background-color: var(--bg-card);\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-sm);\n  padding: 24px;\n  margin-bottom: 24px;\n}\n\n.card-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 18px;\n  padding-bottom: 12px;\n  border-bottom: 1px solid var(--border-color);\n}\n\n.card-title {\n  font-size: 16px;\n  font-weight: 700;\n  color: var(--primary-black);\n}\n\n/* KPI Dashboard Cards */\n.kpi-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));\n  gap: 18px;\n  margin-bottom: 24px;\n}\n\n.kpi-card {\n  background-color: var(--bg-card);\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-lg);\n  padding: 20px;\n  box-shadow: var(--shadow-sm);\n  display: flex;\n  flex-direction: column;\n  position: relative;\n  overflow: hidden;\n}\n\n.kpi-card::before {\n  content: '';\n  position: absolute;\n  top: 0;\n  left: 0;\n  right: 0;\n  height: 4px;\n  background-color: var(--corporate-navy);\n}\n\n.kpi-card.accent-red::before {\n  background-color: var(--accent-red);\n}\n\n.kpi-card.accent-green::before {\n  background-color: var(--success);\n}\n\n.kpi-card.accent-gold::before {\n  background-color: var(--warning);\n}\n\n.kpi-label {\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--text-muted);\n  text-transform: uppercase;\n  letter-spacing: 0.4px;\n}\n\n.kpi-value {\n  font-size: 26px;\n  font-weight: 800;\n  color: var(--primary-black);\n  margin: 8px 0 4px 0;\n}\n\n.kpi-subtext {\n  font-size: 11.5px;\n  color: var(--text-light);\n}\n\n/* Banner Alerts */\n.alert-banner {\n  display: flex;\n  align-items: flex-start;\n  gap: 14px;\n  padding: 16px 20px;\n  border-radius: var(--radius-md);\n  margin-bottom: 24px;\n  font-size: 13.5px;\n}\n\n.alert-warning {\n  background-color: var(--warning-bg);\n  border: 1px solid #FDE68A;\n  color: #92400E;\n}\n\n.alert-danger {\n  background-color: var(--danger-bg);\n  border: 1px solid #FECACA;\n  color: #991B1B;\n}\n\n.alert-info {\n  background-color: var(--info-bg);\n  border: 1px solid #BFDBFE;\n  color: #1E40AF;\n}\n\n.alert-title {\n  font-weight: 700;\n  margin-bottom: 2px;\n}\n\n/* Buttons */\n.btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  padding: 9px 18px;\n  border-radius: var(--radius-md);\n  font-size: 13.5px;\n  font-weight: 600;\n  cursor: pointer;\n  border: 1px solid transparent;\n  transition: all 0.15s ease-in-out;\n  text-decoration: none;\n}\n\n.btn-primary {\n  background-color: var(--corporate-navy);\n  color: #FFF;\n}\n\n.btn-primary:hover {\n  background-color: #173B5C;\n}\n\n.btn-action {\n  background-color: var(--accent-red);\n  color: #FFF;\n  box-shadow: 0 2px 4px rgba(227, 6, 19, 0.25);\n}\n\n.btn-action:hover {\n  background-color: var(--accent-red-hover);\n}\n\n.btn-secondary {\n  background-color: #FFF;\n  border-color: var(--border-color);\n  color: var(--text-main);\n}\n\n.btn-secondary:hover {\n  background-color: #F8FAFC;\n  border-color: #CBD5E1;\n}\n\n.btn-sm {\n  padding: 6px 12px;\n  font-size: 12px;\n  border-radius: var(--radius-sm);\n}\n\n/* Forms & Inputs */\n.form-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));\n  gap: 16px;\n}\n\n.form-group {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  margin-bottom: 14px;\n}\n\n.form-label {\n  font-size: 12.5px;\n  font-weight: 600;\n  color: var(--text-main);\n}\n\n.form-label .required {\n  color: var(--accent-red);\n}\n\n.form-control {\n  height: 40px;\n  padding: 8px 12px;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-md);\n  font-size: 13.5px;\n  font-family: inherit;\n  color: var(--text-main);\n  background-color: #FFF;\n  transition: border-color 0.15s ease, box-shadow 0.15s ease;\n}\n\n.form-control:focus {\n  outline: none;\n  border-color: var(--border-focus);\n  box-shadow: 0 0 0 3px rgba(31, 78, 121, 0.15);\n}\n\nselect.form-control {\n  cursor: pointer;\n}\n\n/* BOQ Dynamic Table Grid */\n.boq-grid-container {\n  overflow-x: auto;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-md);\n  margin-bottom: 18px;\n}\n\n.boq-input-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 13px;\n}\n\n.boq-input-table th {\n  background-color: #F1F5F9;\n  color: var(--text-main);\n  font-weight: 700;\n  padding: 10px 8px;\n  border-bottom: 2px solid var(--border-color);\n  text-align: center;\n}\n\n.boq-input-table td {\n  padding: 6px 8px;\n  border-bottom: 1px solid var(--border-color);\n  vertical-align: middle;\n}\n\n.boq-input-table tr:hover {\n  background-color: #F8FAFC;\n}\n\n.table-input {\n  width: 100%;\n  height: 34px;\n  padding: 4px 8px;\n  border: 1px solid #CBD5E1;\n  border-radius: var(--radius-sm);\n  font-size: 13px;\n}\n\n.table-input:focus {\n  outline: none;\n  border-color: var(--corporate-navy);\n}\n\n.rule-flag {\n  color: var(--accent-red);\n  font-weight: bold;\n  font-size: 14px;\n}\n\n/* Quotation Summary Financial Box */\n.summary-box {\n  background-color: #F8FAFC;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 18px 22px;\n  width: 100%;\n  max-width: 440px;\n  margin-left: auto;\n  margin-right: 0;\n}\n\n[dir=\"rtl\"] .summary-box {\n  margin-left: 0;\n  margin-right: auto;\n}\n\n.summary-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: 8px 0;\n  font-size: 13.5px;\n  border-bottom: 1px solid #E2E8F0;\n}\n\n.summary-row.total-row {\n  border-bottom: none;\n  border-top: 2px solid var(--corporate-navy);\n  padding-top: 12px;\n  margin-top: 6px;\n  font-size: 16px;\n  font-weight: 800;\n  color: var(--corporate-navy);\n}\n\n/* Data Tables */\n.data-table-container {\n  overflow-x: auto;\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-md);\n}\n\n.data-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: 13px;\n  text-align: left;\n}\n\n[dir=\"rtl\"] .data-table {\n  text-align: right;\n}\n\n.data-table th {\n  background-color: #F8FAFC;\n  padding: 12px 14px;\n  font-weight: 700;\n  color: var(--text-muted);\n  border-bottom: 1px solid var(--border-color);\n  text-transform: uppercase;\n  font-size: 11px;\n  letter-spacing: 0.5px;\n}\n\n.data-table td {\n  padding: 12px 14px;\n  border-bottom: 1px solid var(--border-color);\n  vertical-align: middle;\n}\n\n.data-table tr:hover {\n  background-color: #F8FAFC;\n}\n\n/* Modals */\n.modal-overlay {\n  position: fixed;\n  top: 0;\n  left: 0;\n  right: 0;\n  bottom: 0;\n  background-color: rgba(15, 23, 42, 0.6);\n  backdrop-filter: blur(4px);\n  display: none;\n  align-items: center;\n  justify-content: center;\n  z-index: 100;\n  padding: 20px;\n}\n\n.modal-overlay.active {\n  display: flex;\n}\n\n.modal-content {\n  background-color: #FFF;\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-lg);\n  width: 100%;\n  max-width: 900px;\n  max-height: 90vh;\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n\n.modal-header {\n  padding: 18px 24px;\n  border-bottom: 1px solid var(--border-color);\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.modal-body {\n  padding: 24px;\n  overflow-y: auto;\n  flex: 1;\n}\n\n.modal-footer {\n  padding: 16px 24px;\n  border-top: 1px solid var(--border-color);\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 12px;\n  background-color: #F8FAFC;\n}\n\n/* Live Quotation Preview Container */\n.preview-sheet-frame {\n  background-color: #525659;\n  padding: 24px;\n  display: flex;\n  justify-content: center;\n  overflow-y: auto;\n}\n\n.a4-sheet {\n  background-color: #FFF;\n  width: 210mm;\n  min-height: 297mm;\n  padding: 15mm;\n  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.35);\n  box-sizing: border-box;\n}\n\n/* Toast Notifications */\n.toast-container {\n  position: fixed;\n  bottom: 24px;\n  right: 24px;\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  z-index: 200;\n}\n\n[dir=\"rtl\"] .toast-container {\n  right: auto;\n  left: 24px;\n}\n\n.toast {\n  padding: 12px 18px;\n  border-radius: var(--radius-md);\n  font-size: 13.5px;\n  font-weight: 500;\n  color: #FFF;\n  box-shadow: var(--shadow-md);\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  animation: slideIn 0.25s ease-out;\n}\n\n.toast-success { background-color: #059669; }\n.toast-error { background-color: #DC2626; }\n.toast-info { background-color: var(--corporate-navy); }\n\n@keyframes slideIn {\n  from { transform: translateY(20px); opacity: 0; }\n  to { transform: translateY(0); opacity: 1; }\n}\n\n/* Print Specific Rules & Footer Margin Fix */\n.btn-lang-modal-switch {\n  font-weight: 600;\n  transition: all 0.15s ease;\n}\n\n.footer-sign-container {\n  page-break-inside: avoid !important;\n  break-inside: avoid !important;\n  margin-top: 26px !important;\n  padding-top: 10px !important;\n  margin-bottom: 5px !important;\n}\n\n@media print {\n  @page {\n    size: A4 portrait;\n    margin: 12mm 15mm 15mm 15mm;\n  }\n  body {\n    -webkit-print-color-adjust: exact !important;\n    print-color-adjust: exact !important;\n    background: transparent !important;\n  }\n  .top-nav, .sidebar, .modal-header, .modal-footer, .btn, .no-print {\n    display: none !important;\n  }\n  .app-container, .main-content, .modal-overlay, .modal-content, .modal-body, .preview-sheet-frame {\n    padding: 0 !important;\n    margin: 0 !important;\n    background: transparent !important;\n    overflow: visible !important;\n    box-shadow: none !important;\n    display: block !important;\n    position: static !important;\n  }\n  .a4-sheet {\n    box-shadow: none !important;\n    width: 100% !important;\n    min-height: auto !important;\n    padding: 0 !important;\n    margin: 0 !important;\n    border: none !important;\n  }\n  .boq-table tr {\n    page-break-inside: avoid;\n    break-inside: avoid;\n  }\n  .summary-table, .terms-box, .sign-table, .footer-table, .footer-sign-container {\n    page-break-inside: avoid !important;\n    break-inside: avoid !important;\n  }\n  .footer-sign-container, .footer-table, .sign-table {\n    margin-top: 24px !important;\n    margin-bottom: 5px !important;\n    padding-bottom: 10px !important;\n  }\n}\n\n/* Terms Checklist & Management Styles */\n.term-card {\n  border: 1px solid var(--border-color);\n  border-radius: var(--radius-md);\n  padding: 12px 16px;\n  background: #ffffff;\n  transition: all var(--transition-fast);\n  display: flex;\n  align-items: flex-start;\n  gap: 12px;\n}\n.term-card:hover {\n  border-color: #cbd5e1;\n  box-shadow: 0 1px 3px rgba(0,0,0,0.05);\n}\n.term-card.selected {\n  border-color: #93c5fd;\n  background: #f8fafc;\n}\n.term-checkbox {\n  margin-top: 3px;\n  width: 18px;\n  height: 18px;\n  cursor: pointer;\n  accent-color: var(--corporate-navy);\n}\n.term-content {\n  flex: 1;\n}\n.term-title-row {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 4px;\n}\n.term-title {\n  font-weight: 700;\n  font-size: 13.5px;\n  color: var(--corporate-navy);\n}\n.term-text-ar {\n  font-size: 12.5px;\n  color: #334155;\n  line-height: 1.5;\n  margin-bottom: 2px;\n}\n.term-text-en {\n  font-size: 11.5px;\n  color: #64748b;\n  line-height: 1.4;\n  direction: ltr;\n  text-align: left;\n}\n.term-actions {\n  display: flex;\n  gap: 6px;\n  align-items: center;\n}\n.badge-cat {\n  font-size: 11px;\n  padding: 2px 8px;\n  border-radius: 12px;\n  background: #e2e8f0;\n  color: #475569;\n  font-weight: 600;\n}\n\n</style>\n</head>\n<body>\n\n  <!-- Top Navigation Bar -->\n  <header class=\"top-nav\">\n    <div class=\"brand-container\">\n      <img src=\"assets/brixen_logo_black_red.png\" alt=\"BRIXEN LLC\" class=\"brand-logo\" onerror=\"this.style.display='none'; document.getElementById('textLogo').style.display='block';\">\n      <div id=\"textLogo\" style=\"display:none; font-size:22px; font-weight:800; letter-spacing:1px; color:#111;\">\n        BRI<span style=\"color:#E30613;\">X</span>EN <span style=\"font-size:13px; color:#555;\">LLC</span>\n      </div>\n      <div class=\"brand-divider\"></div>\n      <div class=\"system-title-box\">\n        <div class=\"system-title\">\u0645\u0646\u0635\u0629 \u0625\u062f\u0627\u0631\u0629 \u0648\u062d\u0633\u0627\u0628 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631</div>\n        <div class=\"system-subtitle\">BRIXEN Commercial Quotation Engine \u2014 C.R. 7054850701</div>\n      </div>\n    </div>\n\n    <div class=\"nav-actions\">\n      <div class=\"badge badge-connected\" title=\"\u0642\u0627\u0639\u062f\u0629 \u0628\u064a\u0627\u0646\u0627\u062a Google Sheets \u0645\u062a\u0635\u0644\u0629\">\n        <span class=\"badge-dot\"></span>\n        <span id=\"dbStatusLabel\">\u0645\u062a\u0635\u0644 \u0628\u0640 Google Sheets</span>\n      </div>\n      <button type=\"button\" class=\"btn btn-sm btn-secondary\" id=\"langToggleBtn\">English</button>\n    </div>\n  </header>\n\n  <!-- Main Container -->\n  <div class=\"app-container\">\n    \n    <!-- Sidebar Navigation -->\n    <aside class=\"sidebar\">\n      <ul class=\"nav-menu\">\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link active\" data-view=\"dashboard\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6\"/></svg>\n            <span>\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645 (Dashboard)</span>\n          </button>\n        </li>\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link\" data-view=\"create\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M12 4v16m8-8H4\"/></svg>\n            <span>\u0625\u0646\u0634\u0627\u0621 \u0639\u0631\u0636 \u0633\u0639\u0631 \u062c\u062f\u064a\u062f</span>\n            <span class=\"nav-pill\">\u062c\u062f\u064a\u062f</span>\n          </button>\n        </li>\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link\" data-view=\"history\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z\"/></svg>\n            <span>\u0633\u062c\u0644 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631</span>\n          </button>\n        </li>\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link\" data-view=\"customers\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z\"/></svg>\n            <span>\u0633\u062c\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639</span>\n          </button>\n        </li>\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link\" data-view=\"pricelist\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z\"/></svg>\n            <span>\u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0648\u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062a (Price List)</span>\n          </button>\n        </li>\n        <li class=\"nav-item\">\n          <button type=\"button\" class=\"nav-link\" data-view=\"decisions\">\n            <svg class=\"nav-icon\" fill=\"none\" stroke=\"currentColor\" viewBox=\"0 0 24 24\"><path stroke-linecap=\"round\" stroke-linejoin=\"round\" stroke-width=\"2\" d=\"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4\"/></svg>\n            <span>\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a (Terms)</span>\n          </button>\n        </li>\n      </ul>\n\n      <div style=\"font-size:11px; color:#888; text-align:center; padding:10px; border-top:1px solid var(--border-color);\">\n        BRIXEN LLC \u2022 Version 1.0.0<br>\n        Al-Rajhi Bank SA4080000510608010602103\n      </div>\n    </aside>\n\n    <!-- Main Workspace -->\n    <main class=\"main-content\">\n\n      <!-- ============================================================= -->\n      <!-- VIEW 1: DASHBOARD -->\n      <!-- ============================================================= -->\n      <section id=\"view-dashboard\" class=\"view-section active\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0644\u0648\u062d\u0629 \u0645\u0624\u0634\u0631\u0627\u062a \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631</h1>\n            <p>\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u062d\u064a\u0629 \u0648\u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0644\u0649 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0648\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639 \u0648\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0628\u064a\u0639\u0627\u062a</p>\n          </div>\n          <button type=\"button\" class=\"btn btn-action\" onclick=\"document.querySelector('.nav-link[data-view=\\'create\\']').click();\">\n            <span>+ \u0625\u0646\u0634\u0627\u0621 \u0639\u0631\u0636 \u0633\u0639\u0631 \u0641\u0648\u0631\u064a</span>\n          </button>\n        </div>\n\n        <!-- KPI Grid -->\n        <div class=\"kpi-grid\">\n          <div class=\"kpi-card\">\n            <div class=\"kpi-label\">\u0625\u062c\u0645\u0627\u0644\u064a \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631</div>\n            <div class=\"kpi-value\" id=\"kpiTotalQuotes\">0</div>\n            <div class=\"kpi-subtext\">\u0645\u0633\u062c\u0644\u0629 \u0641\u064a \u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a</div>\n          </div>\n          <div class=\"kpi-card accent-green\">\n            <div class=\"kpi-label\">\u0627\u0644\u0639\u0631\u0648\u0636 \u0627\u0644\u0645\u0635\u062f\u0631\u0629 (Issued)</div>\n            <div class=\"kpi-value\" id=\"kpiIssuedQuotes\">0</div>\n            <div class=\"kpi-subtext\">\u062a\u0645 \u0625\u0635\u062f\u0627\u0631\u0647\u0627 \u0631\u0633\u0645\u064a\u0627\u064b \u0645\u0639 \u0627\u0644\u062e\u062a\u0645</div>\n          </div>\n          <div class=\"kpi-card accent-red\">\n            <div class=\"kpi-label\">\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u064a\u0629</div>\n            <div class=\"kpi-value\" id=\"kpiPipelineSAR\">0.00 SAR</div>\n            <div class=\"kpi-subtext\">\u0634\u0627\u0645\u0644\u0629 \u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 15%</div>\n          </div>\n          <div class=\"kpi-card accent-gold\">\n            <div class=\"kpi-label\">\u0639\u062f\u062f \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0633\u062c\u0644\u064a\u0646</div>\n            <div class=\"kpi-value\" id=\"kpiTotalCustomers\">0</div>\n            <div class=\"kpi-subtext\">\u0641\u064a \u0633\u062c\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0627\u0644\u0645\u0639\u062a\u0645\u062f</div>\n          </div>\n        </div>\n\n        <!-- Alert: Commercial Policies & Terms Control -->\n        <div class=\"alert-banner alert-info\" style=\"display:flex; align-items:center; gap:12px;\">\n          <div style=\"font-size:20px;\">\u2699\ufe0f</div>\n          <div>\n            <div class=\"alert-title\">\u0627\u0644\u062a\u062d\u0643\u0645 \u0627\u0644\u0645\u0631\u0646 \u0641\u064a \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0628\u0646\u0648\u062f</div>\n            <div>\u064a\u0645\u0643\u0646\u0643 \u0625\u0636\u0627\u0641\u0629 \u0648\u062a\u0639\u062f\u064a\u0644 \u0623\u064a \u0628\u0646\u062f \u0641\u064a \u062c\u062f\u0648\u0644 \u0627\u0644\u0643\u0645\u064a\u0627\u062a (BOQ)\u060c \u0648\u062a\u062d\u062f\u064a\u062f \u0648\u0627\u062e\u062a\u064a\u0627\u0631 \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645 \u0627\u0644\u062e\u0627\u0635\u0629 \u0628\u0643\u0644 \u0639\u0631\u0636 \u0633\u0639\u0631 \u0628\u062f\u0642\u0629 \u0645\u0646 \u0634\u0627\u0634\u0629 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0639\u0631\u0636 \u0623\u0648 \u062a\u0628\u0648\u064a\u0628 <b>\u00ab\u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a\u00bb</b>.</div>\n          </div>\n        </div>\n\n        <!-- Recent Quotations Card -->\n        <div class=\"card\">\n          <div class=\"card-header\">\n            <div class=\"card-title\">\u0622\u062e\u0631 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0635\u0627\u062f\u0631\u0629 \u0645\u0624\u062e\u0631\u0627\u064b</div>\n          </div>\n          <div class=\"data-table-container\">\n            <table class=\"data-table\">\n              <thead>\n                <tr>\n                  <th>\u0631\u0642\u0645 \u0627\u0644\u0645\u0631\u062c\u0639</th>\n                  <th>\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644</th>\n                  <th>\u0627\u0644\u0645\u0634\u0631\u0648\u0639</th>\n                  <th>\u0627\u0644\u062a\u0627\u0631\u064a\u062e</th>\n                  <th>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629</th>\n                  <th>\u0627\u0644\u062d\u0627\u0644\u0629</th>\n                  <th>\u0625\u062c\u0631\u0627\u0621</th>\n                </tr>\n              </thead>\n              <tbody id=\"dashboardRecentQuotesTable\">\n                <tr><td colspan=\"7\" style=\"text-align:center; color:#888; padding:24px;\">\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631...</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n      </section>\n\n      <!-- ============================================================= -->\n      <!-- VIEW 2: CREATE QUOTATION (SMART BOQ BUILDER) -->\n      <!-- ============================================================= -->\n      <section id=\"view-create\" class=\"view-section\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0625\u0646\u0634\u0627\u0621 \u0639\u0631\u0636 \u0633\u0639\u0631 \u062a\u062c\u0627\u0631\u064a \u0645\u0639\u062a\u0645\u062f (Smart BOQ Engine)</h1>\n            <p>\u0625\u062f\u062e\u0627\u0644 \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a \u0648\u0627\u062d\u062a\u0633\u0627\u0628 \u0627\u0644\u0645\u0633\u0627\u062d\u0627\u062a \u0648\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0648\u0627\u0644\u0636\u0631\u064a\u0628\u0629 15% \u0628\u0636\u063a\u0637\u0629 \u0632\u0631 \u0648\u0627\u062d\u062f\u0629</p>\n          </div>\n          <div style=\"display:flex; gap:10px;\">\n            <button type=\"button\" class=\"btn btn-secondary\" id=\"livePreviewBtn\">\n              <span>\ud83d\udc41\ufe0f \u0645\u0639\u0627\u064a\u0646\u0629 \u0645\u0628\u0627\u0634\u0631\u0629 (A4 Preview)</span>\n            </button>\n            <button type=\"button\" class=\"btn btn-action\" id=\"issueQuotationBtn\">\n              <span>\ud83d\ude80 \u0625\u0635\u062f\u0627\u0631 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 / Issue Quotation</span>\n            </button>\n          </div>\n        </div>\n\n        <!-- Section 1: Customer & Metadata -->\n        <div class=\"card\">\n          <div class=\"card-header\">\n            <div class=\"card-title\">1. \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u0645\u064a\u0644 \u0648\u0627\u0644\u0645\u0634\u0631\u0648\u0639 \u0648\u0627\u0644\u0645\u0631\u062c\u0639</div>\n          </div>\n          <div class=\"form-grid\">\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0627\u062e\u062a\u064a\u0627\u0631 \u0639\u0645\u064a\u0644 \u0645\u0633\u062c\u0644:</label>\n              <select class=\"form-control\" id=\"quoteCustomerSelect\">\n                <option value=\"\">-- \u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644 --</option>\n              </select>\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644 <span class=\"required\">*</span>:</label>\n              <input type=\"text\" class=\"form-control\" id=\"quoteCustomerNameInput\" value=\"\u0627\u0644\u0623\u0633\u062a\u0627\u0630/ \u0639\u0628\u062f \u0627\u0644\u062e\u0627\u0644\u0642 \u0627\u0644\u0645\u0631\u064a\" placeholder=\"\u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0639\u0645\u064a\u0644\">\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0627\u0633\u0645 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 <span class=\"required\">*</span>:</label>\n              <input type=\"text\" class=\"form-control\" id=\"quoteProjectNameInput\" value=\"\u0645\u0634\u0631\u0648\u0639 \u0641\u064a\u0644\u0627 \u0633\u0643\u0646\u064a\u0629 - \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0648\u0627\u062c\u0647\u0627\u062a\">\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0639\u0631\u0636:</label>\n              <input type=\"date\" class=\"form-control\" id=\"quoteDateInput\" value=\"2026-10-27\">\n            </div>\n            <div class=\"form-group\" style=\"grid-column:1 / -1; background:#f8fafc; padding:12px 16px; border-radius:6px; border:1px solid #e2e8f0; margin-top:4px;\">\n              <label class=\"form-label\" style=\"font-weight:700; color:#1F4E79; margin-bottom:8px;\">\n                \ud83c\udf10 \u0644\u063a\u0629 \u0637\u0628\u0627\u0639\u0629 \u0648\u0625\u0635\u062f\u0627\u0631 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 (Document Language Mode):\n              </label>\n              <div class=\"lang-selector-group\" style=\"display:flex; gap:20px; flex-wrap:wrap;\">\n                <label style=\"display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;\">\n                  <input type=\"radio\" name=\"docLanguageMode\" value=\"AR\" checked id=\"langModeAR\">\n                  <span>\ud83c\uddf8\ud83c\udde6 \u0639\u0631\u0628\u064a \u0641\u0642\u0637 (\u0645\u0644\u0641 \u0648\u0627\u062d\u062f PDF \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629)</span>\n                </label>\n                <label style=\"display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600;\">\n                  <input type=\"radio\" name=\"docLanguageMode\" value=\"EN\" id=\"langModeEN\">\n                  <span>\ud83c\uddec\ud83c\udde7 \u0625\u0646\u062c\u0644\u064a\u0632\u064a \u0641\u0642\u0637 (\u0645\u0644\u0641 \u0648\u0627\u062d\u062f PDF \u0625\u0646\u062c\u0644\u064a\u0632\u064a 100%)</span>\n                </label>\n                <label style=\"display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:700; color:#1F4E79;\">\n                  <input type=\"radio\" name=\"docLanguageMode\" value=\"BOTH\" id=\"langModeBoth\">\n                  <span>\ud83c\udf10 \u0639\u0631\u0628\u064a \u0648\u0625\u0646\u062c\u0644\u064a\u0632\u064a \u0645\u0639\u0627\u064b (\u062a\u0648\u0644\u064a\u062f \u0645\u0644\u0641\u064a\u0646 \u0645\u0646\u0641\u0635\u0644\u064a\u0646 2 PDFs: \u0645\u0644\u0641 \u0639\u0631\u0628\u064a \u0643\u0627\u0645\u0644 + \u0645\u0644\u0641 \u0625\u0646\u062c\u0644\u064a\u0632\u064a \u0643\u0627\u0645\u0644)</span>\n                </label>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <!-- Section 2: Smart BOQ Table -->\n        <div class=\"card\">\n          <div class=\"card-header\">\n            <div class=\"card-title\">2. \u062c\u062f\u0648\u0644 \u0627\u0644\u0643\u0645\u064a\u0627\u062a \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a \u0627\u0644\u0630\u0643\u064a (Smart BOQ Table)</div>\n            <button type=\"button\" class=\"btn btn-sm btn-primary\" id=\"addBoqRowBtn\">+ \u0625\u0636\u0627\u0641\u0629 \u0628\u0646\u062f \u062c\u062f\u064a\u062f</button>\n          </div>\n\n          <div class=\"boq-grid-container\">\n            <table class=\"boq-input-table\">\n              <thead>\n                <tr>\n                  <th style=\"width:60px;\">\u0631\u0645\u0632 \u0627\u0644\u0628\u0646\u062f</th>\n                  <th style=\"width:110px;\">\u0627\u0644\u062a\u0635\u0646\u064a\u0641</th>\n                  <th>\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0641\u0646\u064a \u0648\u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062a</th>\n                  <th style=\"width:75px;\">\u0627\u0644\u0639\u0631\u0636 (\u0645)</th>\n                  <th style=\"width:75px;\">\u0627\u0644\u0627\u0631\u062a\u0641\u0627\u0639 (\u0645)</th>\n                  <th style=\"width:65px;\">\u0627\u0644\u0639\u062f\u062f</th>\n                  <th style=\"width:95px;\">\u0627\u0644\u0645\u0633\u0627\u062d\u0629 (\u0645\u00b2)</th>\n                  <th style=\"width:90px;\">\u0627\u0644\u0633\u0639\u0631 (SAR)</th>\n                  <th style=\"width:115px;\">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a (SAR)</th>\n                  <th style=\"width:50px;\">\u062d\u0630\u0641</th>\n                </tr>\n              </thead>\n              <tbody id=\"boqTableBody\">\n                <!-- Dynamically generated rows -->\n              </tbody>\n            </table>\n          </div>\n\n          <!-- Alert for Rule (*) -->\n          <div id=\"minChargeAlertBox\" class=\"alert-banner alert-info\" style=\"display:none; padding:10px 14px; font-size:12.5px; margin-bottom:14px;\"></div>\n\n          <!-- Financial Summary Box -->\n          <div class=\"summary-box\">\n            <div class=\"summary-row\">\n              <span>\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0628\u0646\u0648\u062f \u0642\u0628\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629:</span>\n              <span id=\"sumSubtotal\" style=\"font-weight:700;\">0.00 SAR</span>\n            </div>\n            <div class=\"summary-row\">\n              <span>\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (15%):</span>\n              <span id=\"sumVAT\" style=\"font-weight:700;\">0.00 SAR</span>\n            </div>\n            <div class=\"summary-row total-row\">\n              <span>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629:</span>\n              <span id=\"sumGrandTotal\">0.00 SAR</span>\n            </div>\n          </div>\n        </div>\n\n        <!-- Section 3: Commercial Terms & Interactive Checklist -->\n        <div class=\"card\">\n          <div class=\"card-header\" style=\"display:flex; justify-content:space-between; align-items:center;\">\n            <div class=\"card-title\">3. \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0623\u062d\u0643\u0627\u0645 \u0627\u0644\u062e\u0627\u0635\u0629 \u0628\u0627\u0644\u0639\u0631\u0636 (Terms & Conditions)</div>\n            <button type=\"button\" class=\"btn btn-sm btn-primary\" id=\"btnAddCustomTermToQuoteBtn\">+ \u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0637 \u0645\u062e\u0635\u0635 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636</button>\n          </div>\n          <div class=\"form-grid\" style=\"margin-bottom:16px;\">\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0635\u0644\u0627\u062d\u064a\u0629 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 (\u0623\u064a\u0627\u0645):</label>\n              <input type=\"number\" class=\"form-control\" id=\"quoteValidityInput\" value=\"3\">\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0645\u062f\u0629 \u0627\u0644\u062a\u0648\u0631\u064a\u062f (\u0623\u064a\u0627\u0645 \u062a\u0642\u0648\u064a\u0645\u064a\u0629):</label>\n              <input type=\"number\" class=\"form-control\" id=\"quoteDeliveryInput\" value=\"30\">\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0645\u062f\u0629 \u0627\u0644\u062a\u0631\u0643\u064a\u0628 (\u0623\u064a\u0627\u0645 \u062a\u0642\u0648\u064a\u0645\u064a\u0629):</label>\n              <input type=\"number\" class=\"form-control\" id=\"quoteInstallInput\" value=\"10\">\n            </div>\n            <div class=\"form-group\">\n              <label class=\"form-label\">\u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a \u0627\u0644\u0645\u0639\u062a\u0645\u062f:</label>\n              <input type=\"text\" class=\"form-control\" value=\"\u0645\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062c\u062d\u064a - SA4080000510608010602103\" readonly style=\"background:#f5f5f5;\">\n            </div>\n          </div>\n\n          <div style=\"font-weight:700; color:var(--corporate-navy); margin-bottom:8px; font-size:13.5px;\">\n            \ud83d\udccb \u062a\u062d\u062f\u064a\u062f \u0628\u0646\u0648\u062f \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0645\u0637\u0628\u0648\u0639\u0629 \u0641\u064a \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636 (\u062d\u062f\u062f \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0645\u0631\u063a\u0648\u0628\u0629 \u0623\u0648 \u0639\u062f\u0651\u0644 \u0646\u0635\u0647\u0627):\n          </div>\n          <div id=\"quoteTermsListContainer\" style=\"display:flex; flex-direction:column; gap:8px;\">\n            <!-- Rendered dynamically by app.js -->\n          </div>\n        </div>\n      </section>\n\n      <!-- ============================================================= -->\n      <!-- VIEW 3: QUOTATION HISTORY -->\n      <!-- ============================================================= -->\n      <section id=\"view-history\" class=\"view-section\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0633\u062c\u0644 \u0648\u062a\u0627\u0631\u064a\u062e \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0635\u0627\u062f\u0631\u0629</h1>\n            <p>\u0627\u0633\u062a\u0639\u0631\u0627\u0636 \u062c\u0645\u064a\u0639 \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u0633\u062c\u0644\u0629 \u0641\u064a Google Sheets \u0645\u0639 \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0640 PDF \u0648\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0635\u062f\u064a\u0631</p>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <div class=\"data-table-container\">\n            <table class=\"data-table\">\n              <thead>\n                <tr>\n                  <th>\u0631\u0642\u0645 \u0627\u0644\u0645\u0631\u062c\u0639 (Ref)</th>\n                  <th>\u0627\u0644\u0639\u0645\u064a\u0644</th>\n                  <th>\u0627\u0644\u0645\u0634\u0631\u0648\u0639</th>\n                  <th>\u0627\u0644\u062a\u0627\u0631\u064a\u062e</th>\n                  <th>\u0627\u0644\u0644\u063a\u0629</th>\n                  <th>\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629</th>\n                  <th>\u0627\u0644\u062d\u0627\u0644\u0629</th>\n                  <th>\u0645\u0639\u0627\u064a\u0646\u0629 \u0648\u0637\u0628\u0627\u0639\u0629</th>\n                </tr>\n              </thead>\n              <tbody id=\"historyTableBody\">\n                <tr><td colspan=\"8\" style=\"text-align:center; color:#888; padding:24px;\">\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0633\u062c\u0644...</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n      </section>\n\n      <!-- ============================================================= -->\n      <!-- VIEW 4: CUSTOMERS & PROJECTS -->\n      <!-- ============================================================= -->\n      <section id=\"view-customers\" class=\"view-section\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0633\u062c\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639</h1>\n            <p>\u0625\u062f\u0627\u0631\u0629 \u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u0631\u0628\u0637 \u0645\u0639 \u0645\u0634\u0627\u0631\u064a\u0639 \u0627\u0644\u0641\u0644\u0644 \u0648\u0627\u0644\u0645\u0634\u0627\u0631\u064a\u0639 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629</p>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <div class=\"data-table-container\">\n            <table class=\"data-table\">\n              <thead>\n                <tr>\n                  <th>\u0645\u0639\u0631\u0641 \u0627\u0644\u0639\u0645\u064a\u0644</th>\n                  <th>\u0627\u0644\u0627\u0633\u0645 (\u0639\u0631\u0628\u064a)</th>\n                  <th>\u0627\u0644\u0627\u0633\u0645 (\u0625\u0646\u062c\u0644\u064a\u0632\u064a)</th>\n                  <th>\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641</th>\n                  <th>\u0627\u0644\u0645\u062f\u064a\u0646\u0629</th>\n                </tr>\n              </thead>\n              <tbody id=\"customersTableBody\">\n                <tr><td colspan=\"5\" style=\"text-align:center; color:#888; padding:24px;\">\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0639\u0645\u0644\u0627\u0621...</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n      </section>\n\n      <!-- ============================================================= -->\n      <!-- VIEW 5: PRICE LIST -->\n      <!-- ============================================================= -->\n      <section id=\"view-pricelist\" class=\"view-section\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0642\u0627\u0626\u0645\u0629 \u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0623\u0646\u0638\u0645\u0629 \u0648\u0627\u0644\u0642\u0637\u0627\u0639\u0627\u062a \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629</h1>\n            <p>\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0645\u062a\u0631 \u0627\u0644\u0645\u0631\u0628\u0639 \u0644\u0644\u0623\u0646\u0638\u0645\u0629 (\u0633\u0631\u0627\u064a\u0627\u060c \u0631\u0648\u064a\u0627\u0644\u060c \u062f\u0628\u0644 \u062c\u0644\u0627\u0633\u060c \u0643\u0644\u0627\u062f\u064a\u0646\u062c\u060c \u0645\u0635\u0627\u0639\u062f)</p>\n          </div>\n        </div>\n\n        <div class=\"card\">\n          <div class=\"data-table-container\">\n            <table class=\"data-table\">\n              <thead>\n                <tr>\n                  <th>\u0631\u0645\u0632 \u0627\u0644\u0646\u0638\u0627\u0645</th>\n                  <th>\u0627\u0644\u062a\u0635\u0646\u064a\u0641</th>\n                  <th>\u0627\u0633\u0645 \u0627\u0644\u0646\u0638\u0627\u0645 (\u0639\u0631\u0628\u064a)</th>\n                  <th>\u0627\u0633\u0645 \u0627\u0644\u0646\u0638\u0627\u0645 (\u0625\u0646\u062c\u0644\u064a\u0632\u064a)</th>\n                  <th>\u0633\u0639\u0631 \u0627\u0644\u0645\u062a\u0631 \u0627\u0644\u0645\u0631\u0628\u0639 (SAR)</th>\n                  <th>\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0644\u0644\u0648\u062d\u062f\u0629 (SAR)</th>\n                </tr>\n              </thead>\n              <tbody id=\"priceListTableBody\">\n                <tr><td colspan=\"6\" style=\"text-align:center; color:#888; padding:24px;\">\u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0623\u0633\u0639\u0627\u0631...</td></tr>\n              </tbody>\n            </table>\n          </div>\n        </div>\n      </section>\n\n      <!-- ============================================================= -->\n      <!-- VIEW 6: MASTER TERMS & POLICIES MANAGER -->\n      <!-- ============================================================= -->\n      <section id=\"view-decisions\" class=\"view-section\">\n        <div class=\"view-header\">\n          <div class=\"view-title-group\">\n            <h1>\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629 \u0627\u0644\u0639\u0627\u0645\u0629</h1>\n            <p>\u0625\u062f\u0627\u0631\u0629 \u0628\u0646\u0648\u062f \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0648\u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0648\u0637 \u062c\u062f\u064a\u062f\u0629 \u0623\u0648 \u062a\u0639\u062f\u064a\u0644 \u0635\u064a\u0627\u063a\u062a\u0647\u0627 \u0644\u062a\u0638\u0647\u0631 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0641\u064a \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631</p>\n          </div>\n          <button type=\"button\" class=\"btn btn-primary\" id=\"btnAddNewMasterTerm\">+ \u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0637 \u062c\u062f\u064a\u062f \u0644\u0644\u0645\u0643\u062a\u0628\u0629</button>\n        </div>\n\n        <!-- Master Terms Library Card -->\n        <div class=\"card\">\n          <div class=\"card-header\" style=\"display:flex; justify-content:space-between; align-items:center;\">\n            <div class=\"card-title\">\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u0639\u0627\u0645\u0629 (Master Terms Library)</div>\n            <button type=\"button\" class=\"btn btn-sm btn-secondary\" id=\"btnResetDefaultTerms\">\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629</button>\n          </div>\n          <p style=\"font-size:12.5px; color:#666; margin-bottom:14px;\">\n            \u0647\u0630\u0647 \u0627\u0644\u0634\u0631\u0648\u0637 \u0647\u064a \u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u0645\u0639\u064a\u0627\u0631\u064a\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0644\u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646. \u064a\u0645\u0643\u0646\u0643 \u062a\u0639\u062f\u064a\u0644 \u0623\u064a \u0634\u0631\u0637\u060c \u0625\u0636\u0627\u0641\u0629 \u0633\u064a\u0627\u0633\u0627\u062a \u062c\u062f\u064a\u062f\u0629\u060c \u0623\u0648 \u062d\u0630\u0641 \u0623\u064a \u0634\u0631\u0637 \u062a\u0631\u063a\u0628 \u0641\u064a \u0627\u0633\u062a\u0628\u0639\u0627\u062f\u0647:\n          </p>\n\n          <div id=\"masterTermsContainer\" style=\"display:flex; flex-direction:column; gap:12px;\">\n            <!-- Dynamically populated by app.js -->\n          </div>\n        </div>\n      </section>\n</main>\n  </div>\n\n  <!-- ============================================================= -->\n  <!-- MODAL: LIVE QUOTATION PREVIEW & PRINT -->\n  <!-- ============================================================= -->\n  <div class=\"modal-overlay\" id=\"previewModal\">\n    <div class=\"modal-content\" style=\"max-width:960px;\">\n      <div class=\"modal-header\" style=\"flex-wrap:wrap; gap:12px;\">\n        <div style=\"font-weight:700; font-size:16px; color:var(--corporate-navy);\">\u0645\u0639\u0627\u064a\u0646\u0629 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0645\u0639\u062a\u0645\u062f (Official Quotation Preview)</div>\n        <div class=\"modal-lang-toggle\" style=\"display:flex; align-items:center; gap:8px;\">\n          <span style=\"font-size:12px; font-weight:600; color:#555;\">\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0645\u0633\u062a\u0646\u062f:</span>\n          <button type=\"button\" class=\"btn btn-sm btn-preview-file-switch btn-primary\" data-file=\"AR\" id=\"btnPreviewFileAR\">\ud83d\udcc4 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0639\u0631\u0628\u064a (Arabic PDF)</button>\n          <button type=\"button\" class=\"btn btn-sm btn-preview-file-switch btn-secondary\" data-file=\"EN\" id=\"btnPreviewFileEN\">\ud83d\udcc4 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a (English PDF)</button>\n        </div>\n        <button type=\"button\" class=\"btn btn-sm btn-secondary close-modal-btn\">\u2715 \u0625\u063a\u0644\u0627\u0642</button>\n      </div>\n      <div class=\"modal-body preview-sheet-frame\" id=\"modalPreviewContainer\">\n        <!-- Rendered A4 Sheet -->\n      </div>\n      <div class=\"modal-footer\" style=\"display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;\">\n        <button type=\"button\" class=\"btn btn-secondary close-modal-btn\">\u0625\u063a\u0644\u0627\u0642</button>\n        <div style=\"display:flex; gap:8px; flex-wrap:wrap;\">\n          <button type=\"button\" class=\"btn btn-secondary\" id=\"printArabicOnlyBtn\">\ud83d\udda8\ufe0f \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0639\u0631\u0628\u064a (PDF)</button>\n          <button type=\"button\" class=\"btn btn-secondary\" id=\"printEnglishOnlyBtn\">\ud83d\udda8\ufe0f \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a (PDF)</button>\n          <button type=\"button\" class=\"btn btn-primary\" id=\"printQuotationBtn\">\ud83d\udda8\ufe0f \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0645\u0639\u0631\u0648\u0636 \u062d\u0627\u0644\u064a\u0627\u064b</button>\n        </div>\n      </div>\n    </div>\n  </div>\n\n    <!-- ============================================================= -->\n  <!-- MODAL: ADD / EDIT TERM OR POLICY -->\n  <!-- ============================================================= -->\n  <div class=\"modal-overlay\" id=\"termEditModal\">\n    <div class=\"modal-content\" style=\"max-width:650px;\">\n      <div class=\"modal-header\">\n        <div style=\"font-weight:700; font-size:16px; color:var(--corporate-navy);\" id=\"termModalTitle\">\u0625\u0636\u0627\u0641\u0629 / \u062a\u0639\u062f\u064a\u0644 \u0634\u0631\u0637 \u062a\u062c\u0627\u0631\u064a</div>\n        <button type=\"button\" class=\"btn btn-sm btn-secondary close-term-modal-btn\">\u2715 \u0625\u063a\u0644\u0627\u0642</button>\n      </div>\n      <div class=\"modal-body\" style=\"padding:16px;\">\n        <input type=\"hidden\" id=\"editTermId\">\n        <input type=\"hidden\" id=\"editTermScope\" value=\"MASTER\"> <!-- 'MASTER' or 'QUOTE' -->\n        \n        <div class=\"form-group\" style=\"margin-bottom:12px;\">\n          <label class=\"form-label\">\u0639\u0646\u0648\u0627\u0646 \u0623\u0648 \u062a\u0635\u0646\u064a\u0641 \u0627\u0644\u0634\u0631\u0637 <span class=\"required\">*</span>:</label>\n          <input type=\"text\" class=\"form-control\" id=\"editTermTitle\" placeholder=\"\u0645\u062b\u0627\u0644: \u0634\u0631\u0648\u0637 \u0627\u0644\u062f\u0641\u0639\u060c \u0645\u062f\u0629 \u0627\u0644\u062a\u0648\u0631\u064a\u062f\u060c \u0627\u0644\u0636\u0645\u0627\u0646...\">\n        </div>\n\n        <div class=\"form-group\" style=\"margin-bottom:12px;\">\n          <label class=\"form-label\">\u0646\u0635 \u0627\u0644\u0634\u0631\u0637 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 <span class=\"required\">*</span>:</label>\n          <textarea class=\"form-control\" id=\"editTermTextAr\" rows=\"3\" placeholder=\"\u0627\u0643\u062a\u0628 \u0635\u064a\u0627\u063a\u0629 \u0627\u0644\u0634\u0631\u0637 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629...\"></textarea>\n        </div>\n\n        <div class=\"form-group\" style=\"margin-bottom:12px;\">\n          <label class=\"form-label\">\u0646\u0635 \u0627\u0644\u0634\u0631\u0637 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 (English Text):</label>\n          <textarea class=\"form-control\" id=\"editTermTextEn\" rows=\"3\" placeholder=\"Write term text in English (optional)...\" dir=\"ltr\"></textarea>\n        </div>\n\n        <div class=\"form-group\" style=\"margin-bottom:6px;\">\n          <label style=\"display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:13px;\">\n            <input type=\"checkbox\" id=\"editTermDefaultChecked\" checked>\n            <span>\u062a\u0636\u0645\u064a\u0646 \u0647\u0630\u0627 \u0627\u0644\u0634\u0631\u0637 \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0641\u064a \u0639\u0631\u0648\u0636 \u0627\u0644\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u062c\u062f\u064a\u062f\u0629 (Default Included)</span>\n          </label>\n        </div>\n      </div>\n      <div class=\"modal-footer\">\n        <button type=\"button\" class=\"btn btn-secondary close-term-modal-btn\">\u0625\u0644\u063a\u0627\u0621</button>\n        <button type=\"button\" class=\"btn btn-primary\" id=\"btnSaveTermModal\">\ud83d\udcbe \u062d\u0641\u0638 \u0627\u0644\u0634\u0631\u0637</button>\n      </div>\n    </div>\n  </div>\n\n  <!-- Toast Notification Container -->\n  <div class=\"toast-container\" id=\"toastContainer\"></div>\n\n  <!-- App Script -->\n  <script>\n/**\n * BRIXEN Automated Quotation Management Platform\n * File: app.js\n * Description: Client-side application controller, state management, dynamic BOQ grid,\n *              live calculation engine, dual Apps Script/Local API bridge, and document previewer.\n */\n\n(function() {\n  'use strict';\n\n  // =========================================================================\n  // Application State & Configuration\n  // =========================================================================\n  const State = {\n    currentLang: 'AR', // 'AR' or 'EN'\n    currentView: 'dashboard',\n    isConnectedToAppsScript: (typeof google !== 'undefined' && google.script && google.script.run),\n    \n    // Live Database Caches\n    dashboard: null,\n    customers: [],\n    projects: [],\n    priceList: [],\n    technicalSpecs: [],\n    commercialTerms: [],\n    quotations: [],\n    settings: {},\n\n    // Current Quotation Builder State\n    activeQuote: {\n      customerId: '',\n      customerName: '',\n      projectId: '',\n      projectName: '',\n      referenceNo: 'AUTO',\n      date: new Date().toISOString().substring(0, 10),\n      language: 'AR',\n      languageMode: 'AR',\n      validityDays: 3,\n      deliveryDays: 30,\n      installDays: 10,\n      paymentTermsCode: '50-45-5-INSTALL',\n      vatRate: 0.15,\n      items: []\n    },\n\n    // The 4 Outstanding Business Decisions\n    decisions: {\n      decision1_milestone: {\n        title: 'Decision 1: Final 5% Payment Milestone',\n        status: 'PENDING',\n        selectedOption: 'INSTALL_START', // 'INSTALL_START' (Arabic) or 'HANDOVER' (English)\n        notes: 'Arabic quote specifies 5% upon start of installation; English specifies 5% after handover.'\n      },\n      decision2_validity: {\n        title: 'Decision 2: Quotation Validity Standardization',\n        status: 'PENDING',\n        selectedOption: '3_DAYS', // '3_DAYS' or '7_DAYS'\n        notes: 'Arabic quote enforces 3 days; English quote is open-ended. Recommend 3 days.'\n      },\n      decision3_minCharge: {\n        title: 'Decision 3: Rule (*) Minimum Charge Scope',\n        status: 'PENDING',\n        selectedOption: 'WINDOWS_DOORS_PER_UNIT',\n        notes: 'Enforces SAR 650.00 for units < 1.0 m\u00b2. Clarify scope for commercial/cladding.'\n      },\n      decision4_priceList: {\n        title: 'Decision 4: Approved Pricing List Sign-off',\n        status: 'PENDING',\n        selectedOption: 'PRELIMINARY_RATES',\n        notes: 'Saraya (SAR 650/m\u00b2), Cladding (SAR 350/m\u00b2), Elevator (SAR 350/m\u00b2). Pending executive sign-off.'\n      }\n    }\n  };\n\n  // Default Sample Line Item for BOQ\n  function createDefaultItem(code) {\n    return {\n      itemCode: code || '1',\n      category: 'Windows',\n      systemId: 'SYS-002',\n      descriptionAr: '\u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628 \u0634\u0628\u0627\u0643 \u062b\u0627\u0628\u062a/\u0645\u0641\u0635\u0644\u064a \u0642\u0637\u0627\u0639 \u0633\u0631\u0627\u064a\u0627 105 \u0645\u0645 \u0645\u0639 \u0632\u062c\u0627\u062c \u062f\u0628\u0644 24 \u0645\u0645 GL1',\n      descriptionEn: 'Supply and installation of Saraya 105mm fixed/hinged window with 24mm DGU (GL1)',\n      width: 1.50,\n      height: 1.50,\n      unit: 'm',\n      count: 1,\n      unitAreaM2: 2.25,\n      calculatedAreaM2: 2.25,\n      billedAreaM2: 2.25,\n      unitRate: 650.00,\n      isMinimumApplied: false,\n      lineTotal: 1462.50,\n      notes: ''\n    };\n  }\n\n  // =========================================================================\n  // API Bridge (Supports Google Apps Script RPC + Live REST Cloud + Local Fallback)\n  // =========================================================================\n  const CONFIG = {\n    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzdzU9peSAygjR9_rkRDbjuJL8hX1Foi03KfadO0Ti-hzXS8fPrZ8e0sXhc0t3fK2yp/exec'\n  };\n\n  const API = {\n    callServer: function(action, payload) {\n      return new Promise((resolve, reject) => {\n        if (State.isConnectedToAppsScript) {\n          // Google Apps Script HTML Service direct RPC\n          const runner = google.script.run\n            .withSuccessHandler(res => resolve(res))\n            .withFailureHandler(err => reject(err));\n          \n          if (typeof runner[action] === 'function') {\n            runner[action](payload);\n          } else {\n            reject(new Error(`Server function ${action} not found.`));\n          }\n        } else if (CONFIG.WEB_APP_URL) {\n          // Live Cloud REST API via Web App URL\n          let url = CONFIG.WEB_APP_URL;\n          let options = {};\n          \n          const cleanAction = action.startsWith('api') ? action.charAt(3).toLowerCase() + action.slice(4) : action;\n          const getActions = ['getDashboard', 'getCustomers', 'getProjects', 'getPriceList', 'getTechnicalSpecs', 'getCommercialTerms', 'getQuotations', 'getSettings', 'runTestSuite'];\n\n          if (getActions.includes(cleanAction)) {\n            url += `?action=${cleanAction}`;\n            options = { method: 'GET' };\n          } else {\n            options = {\n              method: 'POST',\n              headers: { 'Content-Type': 'text/plain;charset=utf-8' },\n              body: JSON.stringify({ action: cleanAction, payload: payload })\n            };\n          }\n\n          fetch(url, options)\n            .then(res => res.json())\n            .then(json => {\n              if (json && json.success) {\n                // Update connection badge to show Live Cloud\n                const badge = document.getElementById('connectionBadge');\n                if (badge) {\n                  badge.textContent = '\u0645\u062a\u0635\u0644 \u0633\u062d\u0627\u0628\u064a\u0627\u064b (Google Sheets Live)';\n                  badge.className = 'badge badge-connected';\n                }\n                resolve(json.data);\n              } else {\n                throw new Error((json && json.error) || 'Server returned failure');\n              }\n            })\n            .catch(err => {\n              console.warn(`Live Cloud call failed for ${action}, falling back to Local Mock:`, err);\n              try {\n                const mockRes = LocalMockBackend.dispatch(action, payload);\n                resolve(mockRes);\n              } catch (mockErr) {\n                reject(mockErr);\n              }\n            });\n        } else {\n          // Local Development & Offline Mock Mode\n          setTimeout(() => {\n            try {\n              const res = LocalMockBackend.dispatch(action, payload);\n              resolve(res);\n            } catch (e) {\n              reject(e);\n            }\n          }, 120);\n        }\n      });\n    }\n  };\n\n  // =========================================================================\n  // Local Mock Backend (Allows 100% offline testing with real workspace data)\n  // =========================================================================\n  const LocalMockBackend = {\n    initMockData: function() {\n      if (localStorage.getItem('BRIXEN_MOCK_INITIALIZED')) return;\n\n      const mockCustomers = [\n        { CustomerID: 'CUST-001', NameAr: '\u0627\u0644\u0623\u0633\u062a\u0627\u0630/ \u0639\u0628\u062f \u0627\u0644\u062e\u0627\u0644\u0642 \u0627\u0644\u0645\u0631\u064a', NameEn: 'Mr. Abdulkhaliq Al-Marri', Phone: '+966 50 123 4567', City: 'Khobar' },\n        { CustomerID: 'CUST-002', NameAr: '\u0627\u0644\u0645\u0647\u0646\u062f\u0633 \u0643\u0631\u064a\u0633', NameEn: 'Eng. Kris', Phone: '+966 55 987 6543', City: 'Riyadh' }\n      ];\n      const mockProjects = [\n        { ProjectID: 'PROJ-001', CustomerID: 'CUST-001', ProjectNameAr: '\u0641\u0644\u0629 \u0627\u0644\u062e\u0628\u0631 - \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 \u0648\u0627\u0644\u0623\u0628\u0648\u0627\u0628 \u0648\u0627\u0644\u0643\u0644\u0627\u062f\u064a\u0646\u062c', ProjectNameEn: 'Khobar Villa Project', Location: 'Khobar' },\n        { ProjectID: 'PROJ-002', CustomerID: 'CUST-002', ProjectNameAr: '\u0645\u0634\u0631\u0648\u0639 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0648\u0627\u062c\u0647\u0627\u062a \u0627\u0644\u0632\u062c\u0627\u062c\u064a\u0629', ProjectNameEn: 'Kris Architectural Glazing Project', Location: 'Riyadh' }\n      ];\n      const mockQuotes = [\n        {\n          QuotationID: 'QT-KHB-001',\n          ReferenceNo: 'BRX/QT/KHB/2710/2026',\n          CustomerID: 'CUST-001',\n          CustomerName: '\u0627\u0644\u0623\u0633\u062a\u0627\u0630/ \u0639\u0628\u062f \u0627\u0644\u062e\u0627\u0644\u0642 \u0627\u0644\u0645\u0631\u064a',\n          ProjectName: '\u0641\u0644\u0629 \u0627\u0644\u062e\u0628\u0631 - \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 \u0648\u0627\u0644\u0623\u0628\u0648\u0627\u0628',\n          Date: '2026-10-27',\n          Language: 'AR',\n          SubtotalExclVAT: 53989.52,\n          VATAmount: 8098.43,\n          GrandTotal: 62087.95,\n          Status: 'ISSUED',\n          DocumentURL: '#'\n        },\n        {\n          QuotationID: 'QT-KRIS-002',\n          ReferenceNo: 'BRX/QT/KRIS/0909/2026',\n          CustomerID: 'CUST-002',\n          CustomerName: 'Eng. Kris',\n          ProjectName: 'As per Attached Sketches',\n          Date: '2026-09-09',\n          Language: 'EN',\n          SubtotalExclVAT: 40000.00,\n          VATAmount: 6000.00,\n          GrandTotal: 46000.00,\n          Status: 'ISSUED',\n          DocumentURL: '#'\n        }\n      ];\n\n      localStorage.setItem('BRIXEN_CUSTOMERS', JSON.stringify(mockCustomers));\n      localStorage.setItem('BRIXEN_PROJECTS', JSON.stringify(mockProjects));\n      localStorage.setItem('BRIXEN_QUOTATIONS', JSON.stringify(mockQuotes));\n      localStorage.setItem('BRIXEN_MOCK_INITIALIZED', 'true');\n    },\n\n    dispatch: function(action, payload) {\n      this.initMockData();\n      switch (action) {\n        case 'apiInitializeDatabase':\n          return { spreadsheetId: '16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ', sheetsCreated: ['Settings', 'Customers', 'Projects', 'Quotations'], status: 'SUCCESS' };\n        case 'apiGetDashboard':\n          const quotes = JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');\n          const custs = JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');\n          let pipeline = 0;\n          quotes.forEach(q => pipeline += (q.GrandTotal || 0));\n          return {\n            totalQuotations: quotes.length,\n            draftCount: 0,\n            issuedCount: quotes.length,\n            acceptedCount: 0,\n            totalPipelineSAR: pipeline,\n            recentQuotations: quotes.slice().reverse(),\n            customerCount: custs.length\n          };\n        case 'apiGetCustomers':\n          return JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');\n        case 'apiSaveCustomer':\n          const cList = JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');\n          const newC = Object.assign({}, payload, { CustomerID: 'CUST-' + Math.floor(Math.random()*900+100) });\n          cList.push(newC);\n          localStorage.setItem('BRIXEN_CUSTOMERS', JSON.stringify(cList));\n          return newC;\n        case 'apiGetProjects':\n          return JSON.parse(localStorage.getItem('BRIXEN_PROJECTS') || '[]');\n        case 'apiGetPriceList':\n          return [\n            { SystemID: 'SYS-001', Category: 'Windows', SystemNameAr: '\u0642\u0637\u0627\u0639 \u0633\u0631\u0627\u064a\u0627 \u0642\u0644\u0627\u0628 45 \u0645\u0645', SystemNameEn: 'Saraya Hopper 45mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },\n            { SystemID: 'SYS-002', Category: 'Windows', SystemNameAr: '\u0642\u0637\u0627\u0639 \u0633\u0631\u0627\u064a\u0627 \u0645\u0641\u0635\u0644\u064a/\u062b\u0627\u0628\u062a 105 \u0645\u0645', SystemNameEn: 'Saraya Fixed/Hinged 105mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },\n            { SystemID: 'SYS-003', Category: 'Doors', SystemNameAr: '\u0642\u0637\u0627\u0639 \u0633\u0631\u0627\u064a\u0627 \u0623\u0628\u0648\u0627\u0628 100 \u0645\u0645', SystemNameEn: 'Saraya Doors 100mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },\n            { SystemID: 'SYS-004', Category: 'Windows', SystemNameAr: '\u0631\u0648\u064a\u0627\u0644 \u0633\u0644\u0627\u064a\u062f\u0646\u062c 12 \u0633\u0645 \u0633\u062d\u0627\u0628', SystemNameEn: 'Royal SLD Series 12cm', BaseRateSAR: 950.00, MinChargeSAR: 750.00 },\n            { SystemID: 'SYS-005', Category: 'Cladding', SystemNameAr: '\u0623\u0644\u0648\u0627\u062d \u0643\u0644\u0627\u062f\u064a\u0646\u062c \u0645\u062d\u0644\u064a \u0645\u0636\u0627\u062f \u0644\u0644\u062d\u0631\u064a\u0642', SystemNameEn: 'Fire-Rated Composite Cladding', BaseRateSAR: 350.00, MinChargeSAR: 500.00 },\n            { SystemID: 'SYS-006', Category: 'Elevator', SystemNameAr: '\u0648\u0627\u062c\u0647\u0629 \u0645\u0635\u0639\u062f \u0632\u062c\u0627\u062c 10 \u0645\u0645 \u0641\u0631\u0645\u0644\u0633', SystemNameEn: 'Frameless Glass Elevator 10mm', BaseRateSAR: 350.00, MinChargeSAR: 500.00 }\n          ];\n        case 'apiGetQuotations':\n          return JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');\n        case 'apiIssueQuotation':\n          const qList = JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');\n          const isDual = (payload.languageMode === 'BOTH' || payload.language === 'BOTH');\n          const cleanRef = payload.referenceNo && payload.referenceNo !== 'AUTO' ? payload.referenceNo : 'BRX/QT/' + ('0' + new Date().getDate()).slice(-2) + ('0' + (new Date().getMonth()+1)).slice(-2) + '/' + new Date().getFullYear();\n          const newQuote = {\n            QuotationID: 'QT-' + Math.floor(Math.random()*9000+1000),\n            ReferenceNo: cleanRef,\n            CustomerID: payload.customerId || 'CUST-001',\n            CustomerName: payload.customerName || '\u0639\u0645\u064a\u0644 \u0645\u0639\u062a\u0645\u062f',\n            ProjectName: payload.projectName || '\u0645\u0634\u0631\u0648\u0639 \u0641\u0644\u0644',\n            Date: payload.date || new Date().toISOString().substring(0, 10),\n            Language: isDual ? 'BOTH' : (payload.language || 'AR'),\n            SubtotalExclVAT: payload.subtotal,\n            VATAmount: payload.vatAmount,\n            GrandTotal: payload.grandTotal,\n            Status: 'ISSUED',\n            isDual: isDual,\n            DocumentURL_AR: '#' + cleanRef + '_AR.pdf',\n            DocumentURL_EN: '#' + cleanRef + '_EN.pdf',\n            DocumentURL: isDual ? ('#' + cleanRef + '_AR.pdf | #' + cleanRef + '_EN.pdf') : '#'\n          };\n          qList.push(newQuote);\n          localStorage.setItem('BRIXEN_QUOTATIONS', JSON.stringify(qList));\n          return {\n            success: true,\n            quoteRecord: newQuote,\n            referenceNo: newQuote.ReferenceNo,\n            grandTotal: newQuote.GrandTotal,\n            isDual: isDual,\n            arabicFile: { fileName: cleanRef + '_AR.pdf', url: '#' },\n            englishFile: { fileName: cleanRef + '_EN.pdf', url: '#' }\n          };\n        default:\n          return { success: true };\n      }\n    }\n  };\n\n  // =========================================================================\n  // Calculation Engine (Mirrored Client-Side for Instant Real-Time Feedback)\n  // =========================================================================\n  const CalculationEngine = {\n    calculateItemArea: function(width, height, count, unit) {\n      const w = parseFloat(width) || 0;\n      const h = parseFloat(height) || 0;\n      const qty = parseInt(count, 10) || 1;\n      const u = (unit || 'm').toLowerCase();\n\n      let singleArea = (u === 'mm') ? (w * h) / 1000000.0 : (w * h);\n      let totalArea = singleArea * qty;\n\n      return {\n        unitAreaM2: Math.round(singleArea * 1000000) / 1000000,\n        totalAreaM2: Math.round(totalArea * 1000000) / 1000000\n      };\n    },\n\n    recalculateLine: function(item) {\n      const areaInfo = this.calculateItemArea(item.width, item.height, item.count, item.unit);\n      item.unitAreaM2 = areaInfo.unitAreaM2;\n      item.calculatedAreaM2 = areaInfo.totalAreaM2;\n\n      // Check if user manually entered a billed area override (e.g. Cladding 15 m\u00b2 vs 14.10 m\u00b2)\n      let billableArea = (item.billedAreaM2 !== undefined && item.billedAreaM2 !== null && parseFloat(item.billedAreaM2) > 0)\n        ? parseFloat(item.billedAreaM2)\n        : item.calculatedAreaM2;\n\n      const rate = parseFloat(item.unitRate) || 0;\n      const qty = parseInt(item.count, 10) || 1;\n      let isMin = false;\n      let total = 0;\n\n      // Rule (*) evaluation: unit area < 1.00 m\u00b2\n      const eligible = !item.category || item.category === 'Windows' || item.category === 'Doors';\n      if (eligible && item.unitAreaM2 < 1.000 && item.unitAreaM2 > 0) {\n        isMin = true;\n        total = qty * 650.00; // Flat SAR 650 per unit\n      } else {\n        total = billableArea * rate;\n      }\n\n      item.isMinimumApplied = isMin;\n      item.lineTotal = Math.round(total * 100) / 100;\n      return item;\n    },\n\n    recalculateActiveQuote: function() {\n      let subtotal = 0;\n      let minCount = 0;\n\n      State.activeQuote.items.forEach(itm => {\n        this.recalculateLine(itm);\n        subtotal += itm.lineTotal;\n        if (itm.isMinimumApplied) minCount++;\n      });\n\n      subtotal = Math.round(subtotal * 100) / 100;\n      const vatRate = State.activeQuote.vatRate || 0.15;\n      const vatAmount = Math.round(subtotal * vatRate * 100) / 100;\n      const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;\n\n      State.activeQuote.subtotal = subtotal;\n      State.activeQuote.vatAmount = vatAmount;\n      State.activeQuote.grandTotal = grandTotal;\n      State.activeQuote.minimumSurchargeCount = minCount;\n\n      UI.updateSummaryBox();\n    }\n  };\n\n  // =========================================================================\n  // UI Controller & View Manager\n  // =========================================================================\n  // =========================================================================\n  // Master Commercial Terms & Conditions Library\n  // =========================================================================\n  const DEFAULT_MASTER_TERMS = [\n    {\n      id: 'TERM-01',\n      category: 'Validity',\n      categoryNameAr: '\u0635\u0644\u0627\u062d\u064a\u0629 \u0627\u0644\u0639\u0631\u0636',\n      titleAr: '\u0635\u0644\u0627\u062d\u064a\u0629 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631',\n      titleEn: 'Quotation Validity',\n      textAr: '\u0635\u0644\u0627\u062d\u064a\u0629 \u0627\u0644\u0639\u0631\u0636 3 \u0623\u064a\u0627\u0645 \u062a\u0642\u0648\u064a\u0645\u064a\u0629 \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0635\u062f\u0648\u0631\u0647 \u0646\u0638\u0631\u0627\u064b \u0644\u062a\u0642\u0644\u0628\u0627\u062a \u0623\u0633\u0639\u0627\u0631 \u062e\u0627\u0645 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0632\u062c\u0627\u062c \u0641\u064a \u0627\u0644\u0633\u0648\u0642.',\n      textEn: 'Offer validity is 3 calendar days from quotation date due to market price fluctuations of raw aluminum and glass.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-02',\n      category: 'Payment',\n      categoryNameAr: '\u0627\u0644\u062f\u0641\u0639\u0627\u062a \u0627\u0644\u0645\u0627\u0644\u064a\u0629',\n      titleAr: '\u0634\u0631\u0648\u0637 \u0648\u062c\u062f\u0648\u0644 \u0627\u0644\u062f\u0641\u0639\u0627\u062a',\n      titleEn: 'Payment Terms & Schedule',\n      textAr: '50% \u062f\u0641\u0639\u0629 \u0645\u0642\u062f\u0645\u0629 \u0639\u0646\u062f \u062a\u0648\u0642\u064a\u0639 \u0627\u0644\u0639\u0642\u062f\u060c \u064845% \u0639\u0646\u062f \u062c\u0627\u0647\u0632\u064a\u0629 \u0627\u0644\u0645\u0648\u0627\u062f \u0628\u0627\u0644\u0645\u0635\u0646\u0639 \u0648\u0642\u0628\u0644 \u0627\u0644\u0634\u062d\u0646\u060c \u06485% \u0639\u0646\u062f \u0628\u062f\u0621 \u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062a\u0631\u0643\u064a\u0628 \u0628\u0627\u0644\u0645\u0648\u0642\u0639.',\n      textEn: '50% advance upon contract signing, 45% upon materials factory readiness prior to dispatch, and 5% upon start of site installation.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-03',\n      category: 'Schedule',\n      categoryNameAr: '\u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628',\n      titleAr: '\u0627\u0644\u062c\u062f\u0648\u0644 \u0627\u0644\u0632\u0645\u0646\u064a \u0644\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628',\n      titleEn: 'Fabrication & Installation Schedule',\n      textAr: '\u0645\u062f\u0629 \u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0635\u0646\u064a\u0639 30 \u064a\u0648\u0645\u0627\u064b \u062a\u0642\u0648\u064a\u0645\u064a\u0627\u064b \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u0627\u062d\u064a \u0648\u0627\u0644\u0631\u0633\u0648\u0645\u0627\u062a \u0627\u0644\u062a\u0646\u0641\u064a\u0630\u064a\u0629\u060c \u064810 \u0623\u064a\u0627\u0645 \u0644\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u062a\u0631\u0643\u064a\u0628 \u0628\u0627\u0644\u0645\u0648\u0642\u0639.',\n      textEn: 'Fabrication period is 30 calendar days from approval of site measurements and shop drawings, and 10 days for site installation.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-04',\n      category: 'SiteWork',\n      categoryNameAr: '\u0627\u0644\u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u0627\u062d\u064a',\n      titleAr: '\u0627\u0644\u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u0627\u062d\u064a \u0648\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u0645\u064a\u062f\u0627\u0646\u064a',\n      titleEn: 'Site Survey & Architectural Verification',\n      textAr: '\u0643\u0627\u0641\u0629 \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a \u0648\u0627\u0644\u0641\u062a\u062d\u0627\u062a \u0627\u0644\u0645\u0639\u0645\u0627\u0631\u064a\u0629 \u062e\u0627\u0636\u0639\u0629 \u0644\u0644\u0631\u0641\u0639 \u0627\u0644\u0645\u0633\u0627\u062d\u064a \u0627\u0644\u0645\u064a\u062f\u0627\u0646\u064a \u0648\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u0647\u0646\u062f\u0633\u064a \u0642\u0628\u0644 \u0627\u0644\u0628\u062f\u0621 \u0628\u0642\u0635 \u0648\u0633\u062d\u0628 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645.',\n      textEn: 'All dimensions and architectural openings are subject to final site survey and engineering verification prior to fabrication.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-05',\n      category: 'Pricing',\n      categoryNameAr: '\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649',\n      titleAr: '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0644\u0644\u0645\u0642\u0627\u0633\u0627\u062a \u0627\u0644\u0635\u063a\u064a\u0631\u0629 (*)',\n      titleEn: 'Minimum Unit Charge Rule (*)',\n      textAr: '\u0639\u0644\u0627\u0645\u0629 (*) \u062a\u0634\u064a\u0631 \u0625\u0644\u0649 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0628\u0642\u064a\u0645\u0629 650 \u0631\u064a\u0627\u0644 \u0644\u0644\u0648\u062d\u062f\u0629 \u0627\u0644\u062a\u064a \u062a\u0642\u0644 \u0645\u0633\u0627\u062d\u062a\u0647\u0627 \u0639\u0646 1.00 \u0645\u00b2 \u0644\u062a\u063a\u0637\u064a\u0629 \u062a\u0643\u0627\u0644\u064a\u0641 \u0627\u0644\u062a\u0635\u0646\u064a\u0639 \u0648\u0627\u0644\u0647\u0648\u0627\u0644\u0643 \u0627\u0644\u062a\u0634\u063a\u064a\u0644\u064a\u0629.',\n      textEn: 'Asterisk (*) indicates application of the statutory minimum rate of SAR 650.00 for units under 1.00 m\u00b2 to cover fabrication overheads.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-06',\n      category: 'Bank',\n      categoryNameAr: '\u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a',\n      titleAr: '\u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a \u0627\u0644\u0645\u0639\u062a\u0645\u062f \u062d\u0635\u0631\u0627\u064b',\n      titleEn: 'Authorized Banking Details',\n      textAr: '\u0627\u0644\u062a\u062d\u0648\u064a\u0644 \u062d\u0635\u0631\u0627\u064b \u0625\u0644\u0649 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a \u0627\u0644\u0631\u0633\u0645\u064a \u0628\u0627\u0633\u0645 \u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646 \u0644\u062f\u0649 \u0645\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062c\u062d\u064a - \u0622\u064a\u0628\u0627\u0646: SA4080000510608010602103 \u0648\u0644\u0627 \u064a\u064f\u0639\u062a\u062f \u0628\u0623\u064a \u0633\u062f\u0627\u062f \u0646\u0642\u062f\u064a \u062e\u0627\u0631\u062c \u0627\u0644\u062d\u0633\u0627\u0628.',\n      textEn: 'Payments must be transferred exclusively to BRIXEN LLC official bank account at Al-Rajhi Bank - IBAN: SA4080000510608010602103.',\n      isDefault: true,\n      isSelected: true\n    },\n    {\n      id: 'TERM-07',\n      category: 'Warranty',\n      categoryNameAr: '\u0627\u0644\u0636\u0645\u0627\u0646 \u0627\u0644\u0645\u0639\u062a\u0645\u062f',\n      titleAr: '\u0634\u0647\u0627\u062f\u0629 \u0627\u0644\u0636\u0645\u0627\u0646 \u0648\u062c\u0648\u062f\u0629 \u0627\u0644\u0645\u0648\u0627\u062f',\n      titleEn: 'Warranty & Material Assurance',\n      textAr: '\u0636\u0645\u0627\u0646 \u0644\u0645\u062f\u0629 10 \u0633\u0646\u0648\u0627\u062a \u0639\u0644\u0649 \u062b\u0628\u0627\u062a \u0642\u0637\u0627\u0639\u0627\u062a \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0645\u0642\u0627\u0648\u0645\u0629 \u0627\u0644\u0639\u0648\u0627\u0645\u0644 \u0627\u0644\u062c\u0648\u064a\u0629\u060c \u0648\u0636\u0645\u0627\u0646 \u0633\u0646\u0629 \u0648\u0627\u062d\u062f\u0629 \u0639\u0644\u0649 \u0627\u0644\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062a \u0648\u0627\u0644\u0645\u0641\u0635\u0644\u0627\u062a \u0627\u0644\u0645\u064a\u0643\u0627\u0646\u064a\u0643\u064a\u0629 \u0636\u062f \u0639\u064a\u0648\u0628 \u0627\u0644\u062a\u0635\u0646\u064a\u0639.',\n      textEn: '10-year warranty on aluminum profiles and architectural surface finish, and 1-year warranty on mechanical hardware against defects.',\n      isDefault: false,\n      isSelected: false\n    }\n  ];\n\n  const UI = {\n    init: function() {\n      this.initTermsLibrary();\n      this.bindNavigation();\n      this.bindQuoteBuilderEvents();\n      this.bindTermsEvents();\n      this.loadInitialData();\n      this.setupDefaultQuote();\n      this.renderQuoteTermsChecklist();\n      this.renderMasterTermsLibrary();\n    },\n\n    initTermsLibrary: function() {\n      let stored = localStorage.getItem('BRIXEN_TERMS_LIBRARY');\n      if (!stored) {\n        localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(DEFAULT_MASTER_TERMS));\n        State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));\n      } else {\n        try {\n          State.masterTerms = JSON.parse(stored);\n        } catch (e) {\n          State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));\n        }\n      }\n      // Populate activeQuote.selectedTerms from master terms\n      State.activeQuote.selectedTerms = State.masterTerms.map(t => Object.assign({}, t, {\n        isSelected: (t.isDefault !== false)\n      }));\n    },\n\n    bindNavigation: function() {\n      document.querySelectorAll('.nav-link').forEach(btn => {\n        btn.addEventListener('click', (e) => {\n          e.preventDefault();\n          const targetView = btn.getAttribute('data-view');\n          if (targetView) this.switchView(targetView);\n        });\n      });\n\n      // Language Switcher\n      const langToggle = document.getElementById('langToggleBtn');\n      if (langToggle) {\n        langToggle.addEventListener('click', () => {\n          State.currentLang = (State.currentLang === 'AR') ? 'EN' : 'AR';\n          document.documentElement.setAttribute('dir', State.currentLang === 'AR' ? 'rtl' : 'ltr');\n          document.documentElement.setAttribute('lang', State.currentLang.toLowerCase());\n          langToggle.textContent = (State.currentLang === 'AR') ? 'English' : '\u0639\u0631\u0628\u064a';\n          this.switchLanguageLabels(State.currentLang);\n        });\n      }\n    },\n\n    switchView: function(viewName) {\n      State.currentView = viewName;\n      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));\n      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));\n\n      const activeSec = document.getElementById(`view-${viewName}`);\n      const activeBtn = document.querySelector(`.nav-link[data-view=\"${viewName}\"]`);\n\n      if (activeSec) activeSec.classList.add('active');\n      if (activeBtn) activeBtn.classList.add('active');\n\n      if (viewName === 'dashboard') this.renderDashboard();\n      if (viewName === 'history') this.renderHistoryTable();\n      if (viewName === 'customers') this.renderCustomersTable();\n      if (viewName === 'pricelist') this.renderPriceListTable();\n      if (viewName === 'decisions') this.renderMasterTermsLibrary();\n    },\n\n    switchLanguageLabels: function(lang) {\n      // Toggle language mode on UI\n      const isAr = lang === 'AR';\n      State.activeQuote.language = lang;\n      State.activeQuote.deliveryDays = isAr ? 30 : 20;\n      State.activeQuote.validityDays = isAr ? 3 : 7;\n      CalculationEngine.recalculateActiveQuote();\n    },\n\n    setupDefaultQuote: function() {\n      State.activeQuote.items = [\n        createDefaultItem('W1'),\n        {\n          itemCode: 'W4', category: 'Windows', systemId: 'SYS-001',\n          descriptionAr: '\u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628 \u0634\u0628\u0627\u0643 \u0642\u0644\u0627\u0628- \u063a\u0631\u0641\u0629 \u0627\u0644\u0634\u063a\u0627\u0644\u0629 (0.40 \u00d7 0.60 \u0645) - \u0632\u062c\u0627\u062c \u0645\u062b\u0644\u062c',\n          descriptionEn: 'Supply & install tilt/hopper window (0.40 x 0.60 m) - frosted glass',\n          width: 0.40, height: 0.60, unit: 'm', count: 1,\n          unitAreaM2: 0.24, calculatedAreaM2: 0.24, billedAreaM2: 0.24,\n          unitRate: 650.00, isMinimumApplied: true, lineTotal: 650.00, notes: '\u0637\u0628\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 (*)'\n        },\n        {\n          itemCode: 'D1', category: 'Doors', systemId: 'SYS-003',\n          descriptionAr: '\u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628 \u0628\u0627\u0628 \u0645\u062f\u062e\u0644 \u0627\u0644\u0646\u0633\u0627\u0621- \u062e\u0627\u0631\u062c\u064a - \u0632\u062c\u0627\u062c \u0643\u0627\u0645\u0644 (1.025 \u00d7 2.20 \u0645)',\n          descriptionEn: 'Supply & install women entrance door - full glass (1.025 x 2.20 m)',\n          width: 1.025, height: 2.20, unit: 'm', count: 1,\n          unitAreaM2: 2.255, calculatedAreaM2: 2.255, billedAreaM2: 2.255,\n          unitRate: 650.00, isMinimumApplied: false, lineTotal: 1465.75, notes: ''\n        }\n      ];\n      this.renderBOQRows();\n      CalculationEngine.recalculateActiveQuote();\n    },\n\n    renderBOQRows: function() {\n      const tbody = document.getElementById('boqTableBody');\n      if (!tbody) return;\n\n      tbody.innerHTML = '';\n      State.activeQuote.items.forEach((item, index) => {\n        const tr = document.createElement('tr');\n        tr.dataset.index = index;\n\n        const isMin = item.isMinimumApplied;\n        const star = isMin ? '<span class=\"rule-flag\" title=\"\u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 650 \u0631\u064a\u0627\u0644\">*</span>' : '';\n\n        tr.innerHTML = `\n          <td style=\"text-align:center;\"><input type=\"text\" class=\"table-input item-code\" value=\"${item.itemCode || (index + 1)}\" style=\"text-align:center; width:50px;\"></td>\n          <td>\n            <select class=\"table-input item-category\" style=\"width:100px;\">\n              <option value=\"Windows\" ${item.category === 'Windows' ? 'selected' : ''}>\u0634\u0628\u0627\u0643</option>\n              <option value=\"Doors\" ${item.category === 'Doors' ? 'selected' : ''}>\u0628\u0627\u0628</option>\n              <option value=\"Cladding\" ${item.category === 'Cladding' ? 'selected' : ''}>\u0643\u0644\u0627\u062f\u064a\u0646\u062c</option>\n              <option value=\"Elevator\" ${item.category === 'Elevator' ? 'selected' : ''}>\u0645\u0635\u0639\u062f</option>\n            </select>\n          </td>\n          <td>\n            <input type=\"text\" class=\"table-input item-desc-ar\" value=\"${item.descriptionAr || ''}\" placeholder=\"\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629 (\u062a\u064a\u0645\u0628\u0644\u064a\u062a \u0627\u0644\u0639\u0631\u0628\u064a)...\" title=\"\u0627\u0644\u0648\u0635\u0641 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0644\u062a\u064a\u0645\u0628\u0644\u064a\u062a \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0639\u0631\u0628\u064a\">\n            <input type=\"text\" class=\"table-input item-desc-en\" value=\"${item.descriptionEn || ''}\" placeholder=\"English description (English template)...\" dir=\"ltr\" style=\"font-size:11.5px; margin-top:4px; color:#475569; border-color:#e2e8f0;\" title=\"Description in English for English template\">\n          </td>\n          <td><input type=\"number\" step=\"0.01\" class=\"table-input item-w\" value=\"${item.width}\" style=\"text-align:center; width:65px;\"></td>\n          <td><input type=\"number\" step=\"0.01\" class=\"table-input item-h\" value=\"${item.height}\" style=\"text-align:center; width:65px;\"></td>\n          <td><input type=\"number\" min=\"1\" class=\"table-input item-qty\" value=\"${item.count}\" style=\"text-align:center; width:55px;\"></td>\n          <td style=\"text-align:center; font-weight:600;\">${item.calculatedAreaM2.toFixed(3)} \u0645\u00b2</td>\n          <td><input type=\"number\" step=\"10\" class=\"table-input item-rate\" value=\"${item.unitRate}\" style=\"text-align:right; width:80px;\"></td>\n          <td style=\"text-align:right; font-weight:bold; color:var(--corporate-navy);\">${item.lineTotal.toLocaleString('en-US', {minimumFractionDigits:2})} ${star}</td>\n          <td style=\"text-align:center;\">\n            <button type=\"button\" class=\"btn btn-sm btn-secondary btn-del-row\" title=\"\u062d\u0630\u0641 \u0627\u0644\u0628\u0646\u062f\">\u2715</button>\n          </td>\n        `;\n\n        // Wire change listeners on inputs for live calculation\n        tr.querySelector('.item-code').addEventListener('input', (e) => { item.itemCode = e.target.value; });\n        tr.querySelector('.item-category').addEventListener('change', (e) => { item.category = e.target.value; CalculationEngine.recalculateActiveQuote(); });\n        tr.querySelector('.item-desc-ar').addEventListener('input', (e) => { \n          item.descriptionAr = e.target.value;\n          // Auto-suggest English if empty\n          if (!item.descriptionEn || item.descriptionEn.trim() === '') {\n            item.descriptionEn = `Supply and installation of ${item.category} architectural unit (${item.width} x ${item.height} m)`;\n            const enInput = tr.querySelector('.item-desc-en');\n            if (enInput) enInput.value = item.descriptionEn;\n          }\n        });\n        tr.querySelector('.item-desc-en').addEventListener('input', (e) => { \n          item.descriptionEn = e.target.value;\n        });\n        tr.querySelector('.item-w').addEventListener('input', (e) => { item.width = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });\n        tr.querySelector('.item-h').addEventListener('input', (e) => { item.height = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });\n        tr.querySelector('.item-qty').addEventListener('input', (e) => { item.count = parseInt(e.target.value, 10) || 1; CalculationEngine.recalculateActiveQuote(); });\n        tr.querySelector('.item-rate').addEventListener('input', (e) => { item.unitRate = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });\n        \n        tr.querySelector('.btn-del-row').addEventListener('click', () => {\n          if (State.activeQuote.items.length <= 1) {\n            UI.showToast('\u064a\u062c\u0628 \u0627\u0644\u0625\u0628\u0642\u0627\u0621 \u0639\u0644\u0649 \u0628\u0646\u062f \u0648\u0627\u062d\u062f \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.', 'error');\n            return;\n          }\n          State.activeQuote.items.splice(index, 1);\n          UI.renderBOQRows();\n          CalculationEngine.recalculateActiveQuote();\n        });\n\n        tbody.appendChild(tr);\n      });\n    },\n\n    updateSummaryBox: function() {\n      const q = State.activeQuote;\n      const subtotalEl = document.getElementById('sumSubtotal');\n      const vatEl = document.getElementById('sumVAT');\n      const grandTotalEl = document.getElementById('sumGrandTotal');\n      const minAlertEl = document.getElementById('minChargeAlertBox');\n\n      if (subtotalEl) subtotalEl.textContent = `${(q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;\n      if (vatEl) vatEl.textContent = `${(q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;\n      if (grandTotalEl) grandTotalEl.textContent = `${(q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;\n\n      if (minAlertEl) {\n        if (q.minimumSurchargeCount > 0) {\n          minAlertEl.style.display = 'block';\n          minAlertEl.textContent = `\u0645\u0644\u0627\u062d\u0638\u0629: \u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 (650 \u0631\u064a\u0627\u0644) \u062a\u0644\u0642\u0627\u0626\u064a\u0627\u064b \u0639\u0644\u0649 \u0639\u062f\u062f (${q.minimumSurchargeCount}) \u0641\u062a\u062d\u0627\u062a \u062a\u0642\u0644 \u0645\u0633\u0627\u062d\u062a\u0647\u0627 \u0639\u0646 1.0 \u0645\u00b2 \u0648\u0641\u0642\u0627\u064b \u0644\u0644\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 (*).`;\n        } else {\n          minAlertEl.style.display = 'none';\n        }\n      }\n    },\n\n    bindQuoteBuilderEvents: function() {\n      // Add BOQ Row Button\n      const addRowBtn = document.getElementById('addBoqRowBtn');\n      if (addRowBtn) {\n        addRowBtn.addEventListener('click', () => {\n          const nextIndex = State.activeQuote.items.length + 1;\n          State.activeQuote.items.push(createDefaultItem(`W${nextIndex}`));\n          this.renderBOQRows();\n          CalculationEngine.recalculateActiveQuote();\n        });\n      }\n\n      // Customer Selection Change\n      const custSelect = document.getElementById('quoteCustomerSelect');\n      if (custSelect) {\n        custSelect.addEventListener('change', (e) => {\n          const custId = e.target.value;\n          const found = State.customers.find(c => c.CustomerID === custId);\n          if (found) {\n            State.activeQuote.customerId = found.CustomerID;\n            State.activeQuote.customerName = found.NameAr || found.NameEn;\n            document.getElementById('quoteCustomerNameInput').value = State.activeQuote.customerName;\n          }\n        });\n      }\n\n      // One-Click Issuance Button\n      const issueBtn = document.getElementById('issueQuotationBtn');\n      if (issueBtn) {\n        issueBtn.addEventListener('click', () => this.handleIssueQuotation());\n      }\n\n      // Live Preview Button\n      const previewBtn = document.getElementById('livePreviewBtn');\n      if (previewBtn) {\n        previewBtn.addEventListener('click', () => this.openLivePreviewModal());\n      }\n\n      // Close Modal Buttons\n      document.querySelectorAll('.close-modal-btn').forEach(btn => {\n        btn.addEventListener('click', () => {\n          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));\n        });\n      });\n\n      // Language Mode Radio Listener (AR only, EN only, BOTH 2-PDF files)\n      document.querySelectorAll('input[name=\"docLanguageMode\"]').forEach(radio => {\n        radio.addEventListener('change', (e) => {\n          State.activeQuote.languageMode = e.target.value;\n          State.activeQuote.language = e.target.value;\n        });\n      });\n\n      // Modal Preview File Switch Buttons Listener (Arabic PDF vs English PDF)\n      document.querySelectorAll('.btn-preview-file-switch').forEach(btn => {\n        btn.addEventListener('click', () => {\n          const targetFile = btn.getAttribute('data-file');\n          UI.switchModalPreviewFile(targetFile);\n        });\n      });\n    },\n\n    bindDecisionEvents: function() {\n      // Decision toggle listeners\n      document.querySelectorAll('.decision-toggle-btn').forEach(btn => {\n        btn.addEventListener('click', (e) => {\n          const decisionKey = btn.getAttribute('data-decision');\n          const optionVal = btn.getAttribute('data-option');\n          if (State.decisions[decisionKey]) {\n            State.decisions[decisionKey].selectedOption = optionVal;\n            State.decisions[decisionKey].status = 'CONFIRMED';\n            UI.showToast(`\u062a\u0645 \u062a\u062d\u062f\u064a\u062b ${State.decisions[decisionKey].title} \u0628\u0646\u062c\u0627\u062d.`, 'success');\n            btn.parentElement.querySelectorAll('.decision-toggle-btn').forEach(b => b.classList.remove('btn-primary'));\n            btn.classList.add('btn-primary');\n          }\n        });\n      });\n    },\n\n\n    renderQuoteTermsChecklist: function() {\n      const container = document.getElementById('quoteTermsListContainer');\n      if (!container) return;\n\n      container.innerHTML = '';\n      if (!State.activeQuote.selectedTerms || State.activeQuote.selectedTerms.length === 0) {\n        container.innerHTML = '<div style=\"color:#888; font-size:13px; padding:8px;\">\u0644\u0627 \u062a\u0648\u062c\u062f \u0634\u0631\u0648\u0637 \u0645\u0636\u0627\u0641\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636. \u064a\u0645\u0643\u0646\u0643 \u0627\u0644\u0636\u063a\u0637 \u0639\u0644\u0649 \u0632\u0631 \u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0637 \u0645\u062e\u0635\u0635 \u0628\u0627\u0644\u0623\u0639\u0644\u0649.</div>';\n        return;\n      }\n\n      State.activeQuote.selectedTerms.forEach((term, idx) => {\n        const el = document.createElement('div');\n        el.className = 'term-card' + (term.isSelected ? ' selected' : '');\n        el.innerHTML = `\n          <input type=\"checkbox\" class=\"term-checkbox\" data-idx=\"${idx}\" ${term.isSelected ? 'checked' : ''} title=\"\u062a\u0636\u0645\u064a\u0646 \u0641\u064a \u0627\u0644\u0639\u0631\u0636\">\n          <div class=\"term-content\">\n            <div class=\"term-title-row\">\n              <span class=\"term-title\">${term.titleAr || term.titleEn || '\u0628\u0646\u062f \u0634\u0631\u0637'}</span>\n              <span class=\"badge-cat\">${term.categoryNameAr || term.category || '\u0634\u0631\u0637'}</span>\n            </div>\n            <div class=\"term-text-ar\">${term.textAr || ''}</div>\n            ${term.textEn ? `<div class=\"term-text-en\">${term.textEn}</div>` : ''}\n          </div>\n          <div class=\"term-actions\">\n            <button type=\"button\" class=\"btn btn-sm btn-secondary btn-edit-quote-term\" data-idx=\"${idx}\" title=\"\u062a\u0639\u062f\u064a\u0644 \u0635\u064a\u0627\u063a\u0629 \u0627\u0644\u0634\u0631\u0637\">\u270f\ufe0f</button>\n            <button type=\"button\" class=\"btn btn-sm btn-secondary btn-del-quote-term\" data-idx=\"${idx}\" title=\"\u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0634\u0631\u0637\">\u2715</button>\n          </div>\n        `;\n\n        el.querySelector('.term-checkbox').addEventListener('change', (e) => {\n          term.isSelected = e.target.checked;\n          el.classList.toggle('selected', term.isSelected);\n        });\n\n        el.querySelector('.btn-edit-quote-term').addEventListener('click', () => {\n          UI.openTermEditModal(idx, 'QUOTE');\n        });\n\n        el.querySelector('.btn-del-quote-term').addEventListener('click', () => {\n          State.activeQuote.selectedTerms.splice(idx, 1);\n          UI.renderQuoteTermsChecklist();\n          UI.showToast('\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0634\u0631\u0637 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636.', 'info');\n        });\n\n        container.appendChild(el);\n      });\n    },\n\n    renderMasterTermsLibrary: function() {\n      const container = document.getElementById('masterTermsContainer');\n      if (!container) return;\n\n      container.innerHTML = '';\n      if (!State.masterTerms || State.masterTerms.length === 0) {\n        container.innerHTML = '<div style=\"color:#888; font-size:13px; padding:12px;\">\u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0641\u0627\u0631\u063a\u0629. \u0627\u0636\u063a\u0637 \u0639\u0644\u0649 \u0632\u0631 \u00ab\u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629\u00bb \u0644\u0627\u0633\u062a\u0631\u062c\u0627\u0639 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0645\u0639\u064a\u0627\u0631\u064a\u0629.</div>';\n        return;\n      }\n\n      State.masterTerms.forEach((term, idx) => {\n        const el = document.createElement('div');\n        el.className = 'term-card selected';\n        el.innerHTML = `\n          <div class=\"term-content\">\n            <div class=\"term-title-row\">\n              <span class=\"term-title\">${term.titleAr || term.titleEn}</span>\n              <div style=\"display:flex; align-items:center; gap:8px;\">\n                <span class=\"badge-cat\">${term.categoryNameAr || term.category || '\u0633\u064a\u0627\u0633\u0629'}</span>\n                <span style=\"font-size:11px; color:#64748b; font-weight:600;\">${term.isDefault ? '\u2713 \u0627\u0641\u062a\u0631\u0627\u0636\u064a \u0644\u0643\u0644 \u0639\u0631\u0636' : '\u0627\u062e\u062a\u064a\u0627\u0631\u064a'}</span>\n              </div>\n            </div>\n            <div class=\"term-text-ar\" style=\"font-size:13px; line-height:1.6;\">${term.textAr || ''}</div>\n            ${term.textEn ? `<div class=\"term-text-en\" style=\"font-size:12px; margin-top:4px;\">${term.textEn}</div>` : ''}\n          </div>\n          <div class=\"term-actions\">\n            <button type=\"button\" class=\"btn btn-sm btn-primary btn-edit-master-term\" data-idx=\"${idx}\" title=\"\u062a\u0639\u062f\u064a\u0644 \u0647\u0630\u0627 \u0627\u0644\u0634\u0631\u0637\">\u270f\ufe0f \u062a\u0639\u062f\u064a\u0644</button>\n            <button type=\"button\" class=\"btn btn-sm btn-secondary btn-del-master-term\" data-idx=\"${idx}\" title=\"\u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0634\u0631\u0637\">\ud83d\uddd1\ufe0f \u062d\u0630\u0641</button>\n          </div>\n        `;\n\n        el.querySelector('.btn-edit-master-term').addEventListener('click', () => {\n          UI.openTermEditModal(idx, 'MASTER');\n        });\n\n        el.querySelector('.btn-del-master-term').addEventListener('click', () => {\n          if (confirm('\u0647\u0644 \u0623\u0646\u062a \u0645\u062a\u0623\u0643\u062f \u0645\u0646 \u062d\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0634\u0631\u0637 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0639\u0627\u0645\u0629\u061f')) {\n            State.masterTerms.splice(idx, 1);\n            localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(State.masterTerms));\n            UI.renderMasterTermsLibrary();\n            UI.showToast('\u062a\u0645 \u062d\u0630\u0641 \u0627\u0644\u0634\u0631\u0637 \u0645\u0646 \u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0628\u0646\u062c\u0627\u062d.', 'info');\n          }\n        });\n\n        container.appendChild(el);\n      });\n    },\n\n    openTermEditModal: function(targetIndex, scope) {\n      const modal = document.getElementById('termEditModal');\n      if (!modal) return;\n\n      const titleEl = document.getElementById('termModalTitle');\n      const idInput = document.getElementById('editTermId');\n      const scopeInput = document.getElementById('editTermScope');\n      const termTitleInput = document.getElementById('editTermTitle');\n      const termTextAr = document.getElementById('editTermTextAr');\n      const termTextEn = document.getElementById('editTermTextEn');\n      const defaultCheck = document.getElementById('editTermDefaultChecked');\n\n      idInput.value = targetIndex;\n      scopeInput.value = scope;\n\n      if (targetIndex >= 0) {\n        // Editing existing term\n        const list = (scope === 'MASTER') ? State.masterTerms : State.activeQuote.selectedTerms;\n        const item = list[targetIndex];\n        if (item) {\n          titleEl.textContent = (scope === 'MASTER') ? '\u062a\u0639\u062f\u064a\u0644 \u0634\u0631\u0637 \u0641\u064a \u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0639\u0627\u0645\u0629' : '\u062a\u0639\u062f\u064a\u0644 \u0634\u0631\u0637 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636';\n          termTitleInput.value = item.titleAr || item.titleEn || '';\n          termTextAr.value = item.textAr || '';\n          termTextEn.value = item.textEn || '';\n          defaultCheck.checked = (item.isDefault !== false);\n        }\n      } else {\n        // Adding new term\n        titleEl.textContent = (scope === 'MASTER') ? '\u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0637 \u062c\u062f\u064a\u062f \u0644\u0644\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0639\u0627\u0645\u0629' : '\u0625\u0636\u0627\u0641\u0629 \u0634\u0631\u0637 \u0645\u062e\u0635\u0635 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636';\n        termTitleInput.value = '';\n        termTextAr.value = '';\n        termTextEn.value = '';\n        defaultCheck.checked = true;\n      }\n\n      modal.classList.add('active');\n    },\n\n    saveTermFromModal: function() {\n      const targetIndex = parseInt(document.getElementById('editTermId').value, 10);\n      const scope = document.getElementById('editTermScope').value;\n      const title = document.getElementById('editTermTitle').value.trim();\n      const textAr = document.getElementById('editTermTextAr').value.trim();\n      const textEn = document.getElementById('editTermTextEn').value.trim();\n      const isDefault = document.getElementById('editTermDefaultChecked').checked;\n\n      if (!title || !textAr) {\n        UI.showToast('\u064a\u0631\u062c\u0649 \u0643\u062a\u0627\u0628\u0629 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0634\u0631\u0637 \u0648\u0646\u0635 \u0627\u0644\u0634\u0631\u0637 \u0628\u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629.', 'error');\n        return;\n      }\n\n      if (scope === 'MASTER') {\n        if (targetIndex >= 0 && State.masterTerms[targetIndex]) {\n          State.masterTerms[targetIndex].titleAr = title;\n          State.masterTerms[targetIndex].textAr = textAr;\n          State.masterTerms[targetIndex].textEn = textEn;\n          State.masterTerms[targetIndex].isDefault = isDefault;\n        } else {\n          State.masterTerms.push({\n            id: 'TERM-' + Math.floor(Math.random() * 9000 + 1000),\n            category: 'Custom',\n            categoryNameAr: '\u0645\u062e\u0635\u0635',\n            titleAr: title,\n            titleEn: title,\n            textAr: textAr,\n            textEn: textEn,\n            isDefault: isDefault,\n            isSelected: true\n          });\n        }\n        localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(State.masterTerms));\n        this.renderMasterTermsLibrary();\n        UI.showToast('\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0634\u0631\u0637 \u0641\u064a \u0627\u0644\u0645\u0643\u062a\u0628\u0629 \u0627\u0644\u0639\u0627\u0645\u0629 \u0628\u0646\u062c\u0627\u062d.', 'success');\n      } else {\n        // Scope is QUOTE\n        if (targetIndex >= 0 && State.activeQuote.selectedTerms[targetIndex]) {\n          State.activeQuote.selectedTerms[targetIndex].titleAr = title;\n          State.activeQuote.selectedTerms[targetIndex].textAr = textAr;\n          State.activeQuote.selectedTerms[targetIndex].textEn = textEn;\n          State.activeQuote.selectedTerms[targetIndex].isSelected = true;\n        } else {\n          State.activeQuote.selectedTerms.push({\n            id: 'QTERM-' + Math.floor(Math.random() * 9000 + 1000),\n            category: 'Custom',\n            categoryNameAr: '\u0645\u062e\u0635\u0635',\n            titleAr: title,\n            titleEn: title,\n            textAr: textAr,\n            textEn: textEn,\n            isDefault: false,\n            isSelected: true\n          });\n        }\n        this.renderQuoteTermsChecklist();\n        UI.showToast('\u062a\u0645 \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0634\u0631\u0637 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0639\u0631\u0636 \u0628\u0646\u062c\u0627\u062d.', 'success');\n      }\n\n      document.getElementById('termEditModal').classList.remove('active');\n    },\n\n    bindTermsEvents: function() {\n      // Add custom term button in View 2\n      const btnAddQuoteTerm = document.getElementById('btnAddCustomTermToQuoteBtn');\n      if (btnAddQuoteTerm) {\n        btnAddQuoteTerm.addEventListener('click', () => UI.openTermEditModal(-1, 'QUOTE'));\n      }\n\n      // Add new master term button in View 6\n      const btnAddMasterTerm = document.getElementById('btnAddNewMasterTerm');\n      if (btnAddMasterTerm) {\n        btnAddMasterTerm.addEventListener('click', () => UI.openTermEditModal(-1, 'MASTER'));\n      }\n\n      // Reset default terms button in View 6\n      const btnReset = document.getElementById('btnResetDefaultTerms');\n      if (btnReset) {\n        btnReset.addEventListener('click', () => {\n          if (confirm('\u0647\u0644 \u062a\u0631\u064a\u062f \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0648\u0627\u0644\u0633\u064a\u0627\u0633\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629 \u0644\u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646\u061f')) {\n            localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(DEFAULT_MASTER_TERMS));\n            State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));\n            UI.renderMasterTermsLibrary();\n            State.activeQuote.selectedTerms = State.masterTerms.map(t => Object.assign({}, t, { isSelected: (t.isDefault !== false) }));\n            UI.renderQuoteTermsChecklist();\n            UI.showToast('\u062a\u0645\u062a \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0627\u0641\u062a\u0631\u0627\u0636\u064a\u0629 \u0628\u0646\u062c\u0627\u062d.', 'success');\n          }\n        });\n      }\n\n      // Modal save button\n      const btnSave = document.getElementById('btnSaveTermModal');\n      if (btnSave) {\n        btnSave.addEventListener('click', () => UI.saveTermFromModal());\n      }\n\n      // Close modal buttons\n      document.querySelectorAll('.close-term-modal-btn').forEach(btn => {\n        btn.addEventListener('click', () => {\n          const m = document.getElementById('termEditModal');\n          if (m) m.classList.remove('active');\n        });\n      });\n    },\n\n    loadInitialData: function() {\n      API.callServer('apiGetDashboard').then(data => {\n        State.dashboard = data;\n        this.renderDashboard();\n      }).catch(err => console.warn('Dashboard load error:', err));\n\n      API.callServer('apiGetCustomers').then(data => {\n        State.customers = data || [];\n        this.populateCustomerDropdown();\n      }).catch(err => console.warn('Customers load error:', err));\n\n      API.callServer('apiGetPriceList').then(data => {\n        State.priceList = data || [];\n      }).catch(err => console.warn('Price list load error:', err));\n    },\n\n    populateCustomerDropdown: function() {\n      const select = document.getElementById('quoteCustomerSelect');\n      if (!select) return;\n      select.innerHTML = '<option value=\"\">-- \u0627\u062e\u062a\u0631 \u0627\u0644\u0639\u0645\u064a\u0644 \u0623\u0648 \u0623\u062f\u062e\u0644 \u0627\u0633\u0645\u0627\u064b \u062c\u062f\u064a\u062f\u0627\u064b --</option>';\n      State.customers.forEach(c => {\n        const opt = document.createElement('option');\n        opt.value = c.CustomerID;\n        opt.textContent = `${c.NameAr || c.NameEn} (${c.City || '\u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629'})`;\n        select.appendChild(opt);\n      });\n      // Default to Khobar Villa\n      if (State.customers.length > 0) {\n        select.value = State.customers[0].CustomerID;\n        State.activeQuote.customerId = State.customers[0].CustomerID;\n        State.activeQuote.customerName = State.customers[0].NameAr || State.customers[0].NameEn;\n        const custInput = document.getElementById('quoteCustomerNameInput');\n        if (custInput) custInput.value = State.activeQuote.customerName;\n      }\n    },\n\n    renderDashboard: function() {\n      if (!State.dashboard) return;\n      const d = State.dashboard;\n      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };\n\n      setText('kpiTotalQuotes', d.totalQuotations || 0);\n      setText('kpiIssuedQuotes', d.issuedCount || 0);\n      setText('kpiPipelineSAR', `${(d.totalPipelineSAR || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`);\n      setText('kpiTotalCustomers', d.customerCount || State.customers.length || 0);\n\n      const recentTbody = document.getElementById('dashboardRecentQuotesTable');\n      if (recentTbody && d.recentQuotations) {\n        recentTbody.innerHTML = '';\n        d.recentQuotations.forEach(q => {\n          const tr = document.createElement('tr');\n          tr.innerHTML = `\n            <td style=\"font-weight:bold;\">${q.ReferenceNo || 'BRX-NEW'}</td>\n            <td>${q.CustomerName || '-'}</td>\n            <td>${q.ProjectName || '-'}</td>\n            <td>${q.Date || '-'}</td>\n            <td style=\"font-weight:bold; color:var(--corporate-navy);\">${(q.GrandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR</td>\n            <td><span class=\"badge badge-connected\">${q.Status || 'ISSUED'}</span></td>\n            <td>\n              <button class=\"btn btn-sm btn-secondary btn-view-quote\" data-id=\"${q.QuotationID}\">\u0639\u0631\u0636</button>\n            </td>\n          `;\n          tr.querySelector('.btn-view-quote').addEventListener('click', () => {\n            this.previewHistoricalQuote(q);\n          });\n          recentTbody.appendChild(tr);\n        });\n      }\n    },\n\n    handleIssueQuotation: function() {\n      const q = State.activeQuote;\n      q.customerName = document.getElementById('quoteCustomerNameInput').value.trim() || q.customerName;\n      q.projectName = document.getElementById('quoteProjectNameInput').value.trim() || '\u0645\u0634\u0631\u0648\u0639 \u0633\u0643\u0646\u064a';\n      q.date = document.getElementById('quoteDateInput').value || q.date;\n\n      const selectedRadio = document.querySelector('input[name=\"docLanguageMode\"]:checked');\n      const mode = selectedRadio ? selectedRadio.value : (q.languageMode || 'AR');\n      q.languageMode = mode;\n      q.language = mode;\n\n      if (!q.customerName) {\n        UI.showToast('\u064a\u0631\u062c\u0649 \u0643\u062a\u0627\u0628\u0629 \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064a\u0644.', 'error');\n        return;\n      }\n\n      UI.showToast('\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0642\u0642 \u0648\u0627\u0644\u0627\u062d\u062a\u0633\u0627\u0628 \u0648\u062a\u0648\u0644\u064a\u062f \u0645\u0644\u0641\u0627\u062a PDF...', 'info');\n\n      API.callServer('apiIssueQuotation', q).then(res => {\n        q.referenceNo = res.referenceNo;\n        if (res.isDual || mode === 'BOTH') {\n          UI.showToast(`\u062a\u0645 \u062a\u0648\u0644\u064a\u062f \u0648\u0625\u0635\u062f\u0627\u0631 \u0645\u0644\u0641\u064a\u0646 \u0645\u0646\u0641\u0635\u0644\u064a\u0646 \u0628\u0646\u062c\u0627\u062d (\u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0639\u0631\u0628\u064a + \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a 100%) \u0628\u0631\u0642\u0645: ${res.referenceNo}`, 'success');\n        } else {\n          UI.showToast(`\u062a\u0645 \u0625\u0635\u062f\u0627\u0631 \u0639\u0631\u0636 \u0627\u0644\u0633\u0639\u0631 \u0628\u0646\u062c\u0627\u062d \u0628\u0631\u0642\u0645: ${res.referenceNo}`, 'success');\n        }\n        this.openLivePreviewModal();\n        this.loadInitialData(); // Refresh history\n      }).catch(err => {\n        UI.showToast('\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u0625\u0635\u062f\u0627\u0631 \u0627\u0644\u0639\u0631\u0636: ' + err.message, 'error');\n      });\n    },\n\n    switchModalPreviewFile: function(fileLang) {\n      document.querySelectorAll('.btn-preview-file-switch').forEach(btn => {\n        if (btn.getAttribute('data-file') === fileLang) {\n          btn.classList.remove('btn-secondary');\n          btn.classList.add('btn-primary');\n        } else {\n          btn.classList.remove('btn-primary');\n          btn.classList.add('btn-secondary');\n        }\n      });\n\n      const container = document.getElementById('modalPreviewContainer');\n      if (!container) return;\n      const q = State.activeQuote;\n\n      if (fileLang === 'EN') {\n        container.innerHTML = this.buildEnglishQuotationHTML(q);\n      } else {\n        container.innerHTML = this.buildArabicQuotationHTML(q);\n      }\n      State.activePreviewFile = fileLang;\n    },\n\n    openLivePreviewModal: function() {\n      const modal = document.getElementById('previewModal');\n      if (!modal) return;\n\n      const q = State.activeQuote;\n      q.customerName = document.getElementById('quoteCustomerNameInput').value.trim() || q.customerName;\n      q.projectName = document.getElementById('quoteProjectNameInput').value.trim() || '\u0645\u0634\u0631\u0648\u0639 \u0633\u0643\u0646\u064a';\n      q.date = document.getElementById('quoteDateInput').value || q.date;\n\n      const selectedRadio = document.querySelector('input[name=\"docLanguageMode\"]:checked');\n      const mode = selectedRadio ? selectedRadio.value : (q.languageMode || 'AR');\n      q.languageMode = mode;\n      q.language = mode;\n\n      // Initial preview sheet: EN if English only, else AR\n      const initialFile = (mode === 'EN') ? 'EN' : 'AR';\n      this.switchModalPreviewFile(initialFile);\n\n      modal.classList.add('active');\n\n      // Print currently displayed file\n      const printBtn = document.getElementById('printQuotationBtn');\n      if (printBtn) {\n        printBtn.onclick = () => window.print();\n      }\n\n      // Print Arabic file directly\n      const printArBtn = document.getElementById('printArabicOnlyBtn');\n      if (printArBtn) {\n        printArBtn.onclick = () => {\n          this.switchModalPreviewFile('AR');\n          setTimeout(() => window.print(), 150);\n        };\n      }\n\n      // Print English file directly\n      const printEnBtn = document.getElementById('printEnglishOnlyBtn');\n      if (printEnBtn) {\n        printEnBtn.onclick = () => {\n          this.switchModalPreviewFile('EN');\n          setTimeout(() => window.print(), 150);\n        };\n      }\n    },\n\n    buildArabicQuotationHTML: function(q) {\n      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n\n      let rowsHtml = '';\n      q.items.forEach((itm, idx) => {\n        const star = itm.isMinimumApplied ? '*' : '';\n        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;\n        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);\n        const desc = itm.descriptionAr || itm.descriptionEn;\n\n        rowsHtml += `<tr>\n          <td style=\"text-align:center; font-weight:bold;\">${itm.itemCode || (idx+1)}</td>\n          <td style=\"text-align:right;\">${desc}</td>\n          <td style=\"text-align:center;\">${itm.count}</td>\n          <td style=\"text-align:center;\">${areaDisp} \u0645\u00b2</td>\n          <td style=\"text-align:center;\">\u0645\u00b2</td>\n          <td style=\"text-align:right;\">${rateDisp}</td>\n          <td style=\"text-align:right; font-weight:bold;\">${totalDisp}</td>\n        </tr>`;\n      });\n\n      return `\n        <div class=\"a4-sheet\" dir=\"rtl\">\n          <div style=\"border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;\">\n            <div>\n              <div style=\"font-size:22px; font-weight:800; color:#111; letter-spacing:1px;\">BRI<span style=\"color:#E30613;\">X</span>EN <span style=\"font-size:14px;\">LLC</span></div>\n              <div style=\"font-size:11px; color:#555;\">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>\n              <div style=\"font-size:11px; color:#555;\">www.brixenco.com | info@brixenco.com</div>\n            </div>\n            <div style=\"text-align:left;\">\n              <div style=\"font-size:18px; font-weight:bold; color:#1F4E79;\">\u0639\u0631\u0636 \u062a\u0648\u0631\u064a\u062f \u0648\u062a\u0631\u0643\u064a\u0628 \u0645\u0639\u062a\u0645\u062f</div>\n              <div style=\"font-size:11px; color:#666;\">\u0627\u0644\u0645\u0631\u062c\u0639: ${q.referenceNo}</div>\n            </div>\n          </div>\n\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0631\u062c\u0639:</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.referenceNo}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u062a\u0627\u0631\u064a\u062e:</td>\n              <td style=\"padding:5px 8px;\">${q.date}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0625\u0644\u0649 (\u0627\u0644\u0639\u0645\u064a\u0644):</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.customerName}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0634\u0631\u0648\u0639:</td>\n              <td style=\"padding:5px 8px;\">${q.projectName}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0648\u0636\u0648\u0639:</td>\n              <td style=\"padding:5px 8px;\">\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0632\u062c\u0627\u062c \u0648\u0627\u0644\u0643\u0644\u0627\u062f\u064a\u0646\u062c</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0639\u0645\u0644\u0629:</td>\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u0631\u064a\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062f\u064a (SAR)</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0623\u0633\u0627\u0633:</td>\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u0643\u0645\u064a\u0627\u062a \u0648\u0627\u0644\u0623\u0628\u0639\u0627\u062f \u0627\u0644\u0648\u0627\u0631\u062f\u0629 \u0641\u064a \u062c\u062f\u0627\u0648\u0644 \u0627\u0644\u0645\u0634\u0631\u0648\u0639</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u062a\u0633\u0639\u064a\u0631:</td>\n              <td style=\"padding:5px 8px;\">\u064a\u0634\u0645\u0644 \u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0635\u0646\u064a\u0639 \u0648\u0627\u0644\u0646\u0642\u0644 \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            \u0623\u0648\u0644\u0627\u064b: \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062a \u0627\u0644\u0641\u0646\u064a\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629\n          </div>\n          <div style=\"font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;\">\n            \u2022 <b>\u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645:</b> \u0642\u0637\u0627\u0639 \u0627\u0644\u0642\u0644\u0627\u0628 \u0633\u0631\u0627\u064a\u0627 45 \u0645\u0645 (\u0633\u0645\u0627\u0643\u0629 1.5 \u0645\u0645) \u0644\u0644\u062d\u0645\u0627\u0645\u0627\u062a. \u0642\u0637\u0627\u0639 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 105 \u0645\u0645 (\u0633\u0645\u0627\u0643\u0629 1.5 \u0645\u0645). \u0642\u0637\u0627\u0639 \u0627\u0644\u0623\u0628\u0648\u0627\u0628 \u0633\u0631\u0627\u064a\u0627 100 \u0645\u0645 (\u0633\u0645\u0627\u0643\u0629 2 \u0645\u0645).<br>\n            \u2022 <b>\u0627\u0644\u0632\u062c\u0627\u062c:</b> GL1: 24 \u0645\u0645 \u062f\u0628\u0644 \u0634\u0641\u0627\u0641 \u0645\u0642\u0648\u0649. GL2: 24 \u0645\u0645 \u062f\u0628\u0644 \u0645\u062b\u0644\u062c \u0645\u0642\u0648\u0649 \u0644\u0644\u062d\u0645\u0627\u0645\u0627\u062a. GL3: 10 \u0645\u0645 \u0632\u062c\u0627\u062c \u0645\u0635\u0639\u062f \u0641\u0631\u0645\u0644\u0633 \u0645\u0642\u0648\u0649.<br>\n            \u2022 <b>\u0627\u0644\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062a \u0648\u0627\u0644\u0633\u064a\u0644\u064a\u0643\u0648\u0646:</b> \u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062a \u0625\u064a\u0637\u0627\u0644\u064a\u0629\u060c \u0631\u0628\u0631 EPDM\u060c \u0633\u064a\u0644\u064a\u0643\u0648\u0646 GP / WACKER \u0623\u0644\u0645\u0627\u0646\u064a \u0623\u0635\u0644\u064a.\n          </div>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            \u062b\u0627\u0646\u064a\u0627\u064b: \u062c\u062f\u0648\u0644 \u0627\u0644\u0643\u0645\u064a\u0627\u062a \u0648\u0627\u0644\u0623\u0633\u0639\u0627\u0631 (BOQ)\n          </div>\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;\" border=\"1\" bordercolor=\"#ddd\">\n            <thead style=\"background:#1F4E79; color:#fff;\">\n              <tr>\n                <th style=\"padding:6px;\">\u0627\u0644\u0628\u0646\u062f</th>\n                <th style=\"padding:6px;\">\u0627\u0644\u0648\u0635\u0641 \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a</th>\n                <th style=\"padding:6px; width:50px;\">\u0627\u0644\u0639\u062f\u062f</th>\n                <th style=\"padding:6px; width:80px;\">\u0627\u0644\u0645\u0633\u0627\u062d\u0629</th>\n                <th style=\"padding:6px; width:50px;\">\u0627\u0644\u0648\u062d\u062f\u0629</th>\n                <th style=\"padding:6px; width:80px;\">\u0627\u0644\u0633\u0639\u0631 (SAR)</th>\n                <th style=\"padding:6px; width:95px;\">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a (SAR)</th>\n              </tr>\n            </thead>\n            <tbody>\n              ${rowsHtml}\n            </tbody>\n          </table>\n\n          <table style=\"width:48%; margin-right:auto; margin-left:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0628\u0646\u0648\u062f \u0642\u0628\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629:</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${subtotalFmt} \u0631\u064a\u0627\u0644</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 (15%):</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${vatFmt} \u0631\u064a\u0627\u0644</td>\n            </tr>\n            <tr style=\"background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;\">\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629:</td>\n              <td style=\"text-align:right; padding:5px 8px;\">${grandTotalFmt} \u0631\u064a\u0627\u0644</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            \u062b\u0627\u0644\u062b\u0627\u064b: \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629\n          </div>\n          <ul style=\"font-size:11px; line-height:1.6; margin:0; padding-right:18px;\">\n            ${(function() {\n              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);\n              if (terms.length > 0) {\n                return terms.map(t => `<li><b>${t.titleAr}:</b> ${t.textAr}</li>`).join('');\n              }\n              return `\n                <li><b>\u0635\u0644\u0627\u062d\u064a\u0629 \u0627\u0644\u0639\u0631\u0636:</b> ${q.validityDays || 3} \u0623\u064a\u0627\u0645 \u062a\u0642\u0648\u064a\u0645\u064a\u0629 \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0635\u062f\u0648\u0631 \u0627\u0644\u0639\u0631\u0636.</li>\n                <li><b>\u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628:</b> ${q.deliveryDays || 30} \u064a\u0648\u0645\u0627\u064b \u0644\u0644\u062a\u0648\u0631\u064a\u062f \u0628\u0627\u0644\u0645\u0635\u0646\u0639\u060c \u0648${q.installDays || 10} \u0623\u064a\u0627\u0645 \u0644\u0644\u062a\u0631\u0643\u064a\u0628 \u0628\u0627\u0644\u0645\u0648\u0642\u0639.</li>\n                <li><b>\u0634\u0631\u0648\u0637 \u0627\u0644\u062f\u0641\u0639:</b> 50% \u0639\u0646\u062f \u062a\u0648\u0642\u064a\u0639 \u0627\u0644\u0639\u0642\u062f\u060c \u064845% \u0639\u0646\u062f \u062c\u0627\u0647\u0632\u064a\u0629 \u0627\u0644\u0645\u0648\u0627\u062f \u0628\u0627\u0644\u0645\u0635\u0646\u0639\u060c \u06485% \u0639\u0646\u062f \u0627\u0644\u0628\u062f\u0621 \u0628\u0627\u0644\u062a\u0631\u0643\u064a\u0628.</li>\n                <li>\u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a \u062a\u062e\u0636\u0639 \u0644\u0644\u0631\u0641\u0639 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u0628\u0627\u0644\u0645\u0648\u0642\u0639 \u0648\u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0642\u0628\u0644 \u0628\u062f\u0621 \u0642\u0635 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645.</li>\n                <li>\u0639\u0644\u0627\u0645\u0629 (*) \u062a\u0639\u0646\u064a \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 \u0628\u0642\u064a\u0645\u0629 650 \u0631\u064a\u0627\u0644 \u0644\u0644\u0648\u062d\u062f\u0629 \u0627\u0644\u062a\u064a \u062a\u0642\u0644 \u0645\u0633\u0627\u062d\u062a\u0647\u0627 \u0639\u0646 1 \u0645\u00b2.</li>\n                <li><b>\u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a \u0627\u0644\u0645\u0639\u062a\u0645\u062f \u062d\u0635\u0631\u0627\u064b:</b> \u0645\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062c\u062d\u064a - IBAN: <b>SA4080000510608010602103</b> \u0628\u0627\u0633\u0645 \u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646.</li>\n              `;\n            })()}\n          </ul>\n\n          <div class=\"footer-sign-container\" style=\"page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;\">\n            <div>\n              <div style=\"font-size:12px;\">\u0634\u0627\u0643\u0631\u064a\u0646 \u0644\u0643\u0645 \u0625\u062a\u0627\u062d\u0629 \u0627\u0644\u0641\u0631\u0635\u0629 \u0644\u062a\u0642\u062f\u064a\u0645 \u0639\u0631\u0636\u0646\u0627\u060c \u0648\u0646\u062a\u0637\u0644\u0639 \u0644\u0644\u0639\u0645\u0644 \u0645\u0639\u0643\u0645.</div>\n              <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;\">\u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646 \u0630\u0627\u062a \u0645\u0633\u0624\u0648\u0644\u064a\u0629 \u0645\u062d\u062f\u0648\u062f\u0629</div>\n              <div style=\"font-size:11px; color:#666;\">\u0633\u062c\u0644 \u062a\u062c\u0627\u0631\u064a: 7054850701 | \u0627\u0644\u0631\u064a\u0627\u0636 - \u0627\u0644\u0645\u0645\u0644\u0643\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629</div>\n            </div>\n            <div style=\"text-align:left;\">\n              <div style=\"border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:11px; font-weight:bold; background:#f9fbfe; border-radius:4px; display:inline-block; margin-bottom:6px;\">\n                \u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646 \u0630.\u0645.\u0645<br>\n                \u0633.\u062a: 7054850701<br>\n                \u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u0639\u062a\u0645\u062f\n              </div>\n            </div>\n          </div>\n        </div>\n      `;\n    },\n\n    buildEnglishQuotationHTML: function(q) {\n      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n\n      let rowsHtml = '';\n      q.items.forEach((itm, idx) => {\n        const star = itm.isMinimumApplied ? '*' : '';\n        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;\n        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);\n        const descEn = itm.descriptionEn || (`Supply and installation of ${itm.category || 'aluminum'} architectural unit.`);\n\n        rowsHtml += `<tr>\n          <td style=\"text-align:center; font-weight:bold;\">${itm.itemCode || (idx+1)}</td>\n          <td style=\"text-align:left;\">${descEn}</td>\n          <td style=\"text-align:center;\">${itm.count}</td>\n          <td style=\"text-align:center;\">${areaDisp} m\u00b2</td>\n          <td style=\"text-align:center;\">m\u00b2</td>\n          <td style=\"text-align:right;\">${rateDisp}</td>\n          <td style=\"text-align:right; font-weight:bold;\">${totalDisp}</td>\n        </tr>`;\n      });\n\n      return `\n        <div class=\"a4-sheet\" dir=\"ltr\">\n          <div style=\"border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;\">\n            <div>\n              <div style=\"font-size:22px; font-weight:800; color:#111; letter-spacing:1px;\">BRI<span style=\"color:#E30613;\">X</span>EN <span style=\"font-size:14px;\">LLC</span></div>\n              <div style=\"font-size:11px; color:#555;\">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>\n              <div style=\"font-size:11px; color:#555;\">www.brixenco.com | info@brixenco.com</div>\n            </div>\n            <div style=\"text-align:right;\">\n              <div style=\"font-size:18px; font-weight:bold; color:#1F4E79;\">Commercial Quotation</div>\n              <div style=\"font-size:11px; color:#666;\">Ref: ${q.referenceNo}</div>\n            </div>\n          </div>\n\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;\">Ref. No.:</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.referenceNo}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;\">Date:</td>\n              <td style=\"padding:5px 8px;\">${q.date}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">To (Client):</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.customerName}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">Project:</td>\n              <td style=\"padding:5px 8px;\">${q.projectName}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">Subject:</td>\n              <td style=\"padding:5px 8px;\">Aluminum Doors, Windows, Glazing & Cladding Works</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">Currency:</td>\n              <td style=\"padding:5px 8px;\">Saudi Riyal (SAR)</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">Basis:</td>\n              <td style=\"padding:5px 8px;\">Architectural drawings, project BOQ, and site measurements</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">Pricing Scope:</td>\n              <td style=\"padding:5px 8px;\">Supply, fabrication, transport, and site installation</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            A) TECHNICAL SPECIFICATIONS & BASIS OF DESIGN\n          </div>\n          <div style=\"font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;\">\n            \u2022 <b>Aluminum Profiles:</b> Saraya 105mm fixed/hinged window series (1.5mm wall thickness); Saraya 45mm hopper series (1.5mm thickness); Heavy Duty Door Series 100mm (2.0mm thickness).<br>\n            \u2022 <b>Glazing Composition:</b> GL1: 24mm DGU (6mm Clear Temp + 12mm Air Space + 6mm Clear Temp). GL2: 24mm Frosted DGU for bathrooms. GL3: 10mm Clear Tempered Frameless Structural Glass for elevator facade.<br>\n            \u2022 <b>Hardware & Accessories:</b> Genuine Italian mechanical hardware & multi-point locking gear, continuous EPDM weather-stripping rubber gaskets, German GP / WACKER structural silicone.\n          </div>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            B) PRICE SCHEDULE (BOQ)\n          </div>\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;\" border=\"1\" bordercolor=\"#ddd\">\n            <thead style=\"background:#1F4E79; color:#fff;\">\n              <tr>\n                <th style=\"padding:6px; width:50px;\">Item</th>\n                <th style=\"padding:6px;\">Description & Opening Dimensions</th>\n                <th style=\"padding:6px; width:50px;\">Qty</th>\n                <th style=\"padding:6px; width:85px;\">Total Area</th>\n                <th style=\"padding:6px; width:50px;\">Unit</th>\n                <th style=\"padding:6px; width:85px;\">Rate (SAR)</th>\n                <th style=\"padding:6px; width:95px;\">Amount (SAR)</th>\n              </tr>\n            </thead>\n            <tbody>\n              ${rowsHtml}\n            </tbody>\n          </table>\n\n          <table style=\"width:48%; margin-left:auto; margin-right:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">Total Net Price (Excl. VAT):</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${subtotalFmt} SAR</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">Value Added Tax (15% VAT):</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${vatFmt} SAR</td>\n            </tr>\n            <tr style=\"background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;\">\n              <td style=\"padding:5px 8px;\">Grand Total (Incl. VAT):</td>\n              <td style=\"text-align:right; padding:5px 8px;\">${grandTotalFmt} SAR</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;\">\n            C) COMMERCIAL TERMS & CONDITIONS\n          </div>\n          <ul style=\"font-size:11px; line-height:1.6; margin:0; padding-left:18px;\">\n            ${(function() {\n              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);\n              if (terms.length > 0) {\n                return terms.map(t => {\n                  const title = (t.titleEn || t.titleAr || '').replace(/[\\u0600-\\u06FF]/g, '').trim();\n                  const body = (t.textEn || t.textAr || '').replace(/[\\u0600-\\u06FF]/g, '').trim();\n                  return `<li>${title ? `<b>${title}:</b> ` : ''}${body}</li>`;\n                }).join('');\n              }\n              return `\n                <li><b>Offer Validity:</b> ${q.validityDays || 3} calendar days from date of quotation.</li>\n                <li><b>Manufacturing & Installation:</b> ${q.deliveryDays || 30} calendar days for factory fabrication, and ${q.installDays || 10} calendar days for site installation.</li>\n                <li><b>Payment Terms:</b> 50% advance upon contract signing; 45% when materials are ready at factory prior to dispatch; 5% upon start of site installation.</li>\n                <li><b>Site Verification:</b> All dimensions are subject to final architectural site verification and approval prior to cutting.</li>\n                <li><b>Minimum Unit Rule (*):</b> Asterisk (*) indicates application of statutory minimum price of SAR 650.00 for units &lt; 1.0 m\u00b2.</li>\n                <li><b>Authorized Bank Account:</b> Al-Rajhi Bank | Beneficiary: BRIXEN LLC | IBAN: <b>SA4080000510608010602103</b></li>\n              `;\n            })()}\n          </ul>\n\n          <div class=\"footer-sign-container\" style=\"page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;\">\n            <div>\n              <div style=\"font-size:12px; color:#444;\">Thank you for the opportunity to submit our proposal. We look forward to a successful cooperation.</div>\n              <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;\">BRIXEN LLC \u2014 Architectural Aluminum & Glazing</div>\n              <div style=\"font-size:11px; color:#666;\">Commercial Registration: 7054850701 | Riyadh, Kingdom of Saudi Arabia</div>\n            </div>\n            <div style=\"text-align:right;\">\n              <div style=\"border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:10.5px; font-weight:bold; background:#f7faff; border-radius:4px; display:inline-block; margin-bottom:6px;\">\n                BRIXEN LLC<br>\n                C.R. 7054850701<br>\n                AUTHORIZED QUOTATION\n              </div>\n            </div>\n          </div>\n        </div>\n      `;\n    },\n\n    buildBilingualQuotationHTML: function(q) {\n      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n\n      let rowsHtml = '';\n      q.items.forEach((itm, idx) => {\n        const star = itm.isMinimumApplied ? '*' : '';\n        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;\n        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});\n        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);\n        const descAr = itm.descriptionAr || '';\n        const descEn = itm.descriptionEn || '';\n\n        rowsHtml += `<tr>\n          <td style=\"text-align:center; font-weight:bold;\">${itm.itemCode || (idx+1)}</td>\n          <td style=\"text-align:right;\">\n            <div style=\"font-weight:600; color:#111;\">${descAr}</div>\n            <div style=\"font-size:10px; color:#475569; direction:ltr; text-align:left;\">${descEn}</div>\n          </td>\n          <td style=\"text-align:center;\">${itm.count}</td>\n          <td style=\"text-align:center;\">${areaDisp} m\u00b2</td>\n          <td style=\"text-align:center;\">\u0645\u00b2 / m\u00b2</td>\n          <td style=\"text-align:right;\">${rateDisp}</td>\n          <td style=\"text-align:right; font-weight:bold;\">${totalDisp}</td>\n        </tr>`;\n      });\n\n      return `\n        <div class=\"a4-sheet\" dir=\"rtl\">\n          <div style=\"border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;\">\n            <div>\n              <div style=\"font-size:22px; font-weight:800; color:#111; letter-spacing:1px;\">BRI<span style=\"color:#E30613;\">X</span>EN <span style=\"font-size:14px;\">LLC</span></div>\n              <div style=\"font-size:11px; color:#555;\">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>\n              <div style=\"font-size:11px; color:#555;\">www.brixenco.com | info@brixenco.com</div>\n            </div>\n            <div style=\"text-align:left;\">\n              <div style=\"font-size:16px; font-weight:bold; color:#1F4E79;\">COMMERCIAL QUOTATION / \u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u0639\u062a\u0645\u062f</div>\n              <div style=\"font-size:11px; color:#666;\">Ref: ${q.referenceNo}</div>\n            </div>\n          </div>\n\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11.5px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; width:18%; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0631\u062c\u0639 / Ref.:</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.referenceNo}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; width:18%; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u062a\u0627\u0631\u064a\u062e / Date:</td>\n              <td style=\"padding:5px 8px;\">${q.date}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0625\u0644\u0649 / Client:</td>\n              <td style=\"font-weight:bold; padding:5px 8px;\">${q.customerName}</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0634\u0631\u0648\u0639 / Project:</td>\n              <td style=\"padding:5px 8px;\">${q.projectName}</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0645\u0648\u0636\u0648\u0639 / Subject:</td>\n              <td style=\"padding:5px 8px;\">\u0623\u0639\u0645\u0627\u0644 \u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 \u0648\u0627\u0644\u0632\u062c\u0627\u062c \u0648\u0627\u0644\u0643\u0644\u0627\u062f\u064a\u0646\u062c / Aluminum & Glazing Works</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0639\u0645\u0644\u0629 / Currency:</td>\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u0631\u064a\u0627\u0644 \u0627\u0644\u0633\u0639\u0648\u062f\u064a / Saudi Riyal (SAR)</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u0623\u0633\u0627\u0633 / Basis:</td>\n              <td style=\"padding:5px 8px;\">\u0645\u062e\u0637\u0637\u0627\u062a \u0648\u062c\u062f\u0627\u0648\u0644 \u0627\u0644\u0645\u0634\u0631\u0648\u0639 / Project Drawings & Site Verification</td>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;\">\u0627\u0644\u062a\u0633\u0639\u064a\u0631 / Scope:</td>\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0635\u0646\u064a\u0639 \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628 / Supply, Fabrication & Installation</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;\">\n            <span>\u0623\u0648\u0644\u0627\u064b: \u0627\u0644\u0645\u0648\u0627\u0635\u0641\u0627\u062a \u0627\u0644\u0641\u0646\u064a\u0629 \u0627\u0644\u0645\u0639\u062a\u0645\u062f\u0629</span>\n            <span style=\"font-size:11px; font-weight:normal; direction:ltr;\">A) TECHNICAL SPECIFICATIONS</span>\n          </div>\n          <div style=\"font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;\">\n            \u2022 <b>\u0627\u0644\u0623\u0644\u0645\u0646\u064a\u0648\u0645 / Aluminum:</b> \u0642\u0637\u0627\u0639 \u0627\u0644\u0642\u0644\u0627\u0628 \u0633\u0631\u0627\u064a\u0627 45 \u0645\u0645 \u0644\u0644\u062d\u0645\u0627\u0645\u0627\u062a\u060c \u0642\u0637\u0627\u0639 \u0627\u0644\u0646\u0648\u0627\u0641\u0630 105 \u0645\u0645\u060c \u0642\u0637\u0627\u0639 \u0627\u0644\u0623\u0628\u0648\u0627\u0628 \u0633\u0631\u0627\u064a\u0627 100 \u0645\u0645 (Saraya 105mm, 45mm, 100mm door series).<br>\n            \u2022 <b>\u0627\u0644\u0632\u062c\u0627\u062c / Glazing:</b> GL1: 24 \u0645\u0645 \u062f\u0628\u0644 \u0634\u0641\u0627\u0641 \u0645\u0642\u0648\u0649 (24mm Clear DGU). GL2: 24 \u0645\u0645 \u062f\u0628\u0644 \u0645\u062b\u0644\u062c \u0645\u0642\u0648\u0649 (24mm Frosted DGU). GL3: 10 \u0645\u0645 \u0632\u062c\u0627\u062c \u0645\u0635\u0639\u062f \u0641\u0631\u0645\u0644\u0633.<br>\n            \u2022 <b>\u0627\u0644\u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062a / Hardware:</b> \u0625\u0643\u0633\u0633\u0648\u0627\u0631\u0627\u062a \u0625\u064a\u0637\u0627\u0644\u064a\u0629 \u0645\u0639\u062a\u0645\u062f\u0629\u060c \u0631\u0628\u0631 EPDM\u060c \u0633\u064a\u0644\u064a\u0643\u0648\u0646 \u0623\u0644\u0645\u0627\u0646\u064a \u0623\u0635\u0644\u064a GP / WACKER.\n          </div>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;\">\n            <span>\u062b\u0627\u0646\u064a\u0627\u064b: \u062c\u062f\u0648\u0644 \u0627\u0644\u0643\u0645\u064a\u0627\u062a \u0648\u0627\u0644\u0623\u0633\u0639\u0627\u0631 (BOQ)</span>\n            <span style=\"font-size:11px; font-weight:normal; direction:ltr;\">B) PRICE SCHEDULE</span>\n          </div>\n          <table style=\"width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;\" border=\"1\" bordercolor=\"#ddd\">\n            <thead style=\"background:#1F4E79; color:#fff;\">\n              <tr>\n                <th style=\"padding:6px; width:45px;\">\u0627\u0644\u0628\u0646\u062f / Item</th>\n                <th style=\"padding:6px;\">\u0627\u0644\u0648\u0635\u0641 \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062a / Description & Dimensions</th>\n                <th style=\"padding:6px; width:50px;\">\u0627\u0644\u0639\u062f\u062f / Qty</th>\n                <th style=\"padding:6px; width:80px;\">\u0627\u0644\u0645\u0633\u0627\u062d\u0629 / Area</th>\n                <th style=\"padding:6px; width:65px;\">\u0627\u0644\u0648\u062d\u062f\u0629 / Unit</th>\n                <th style=\"padding:6px; width:80px;\">\u0627\u0644\u0633\u0639\u0631 / Rate</th>\n                <th style=\"padding:6px; width:95px;\">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a / Total</th>\n              </tr>\n            </thead>\n            <tbody>\n              ${rowsHtml}\n            </tbody>\n          </table>\n\n          <table style=\"width:50%; margin-right:auto; margin-left:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;\" border=\"1\" bordercolor=\"#ccc\">\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0628\u0646\u0648\u062f / Subtotal (Excl. VAT):</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${subtotalFmt} SAR</td>\n            </tr>\n            <tr>\n              <td style=\"background:#f8fafc; font-weight:bold; padding:4px 8px;\">\u0636\u0631\u064a\u0628\u0629 \u0627\u0644\u0642\u064a\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 / VAT (15%):</td>\n              <td style=\"text-align:right; padding:4px 8px;\">${vatFmt} SAR</td>\n            </tr>\n            <tr style=\"background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;\">\n              <td style=\"padding:5px 8px;\">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a \u0634\u0627\u0645\u0644 \u0627\u0644\u0636\u0631\u064a\u0628\u0629 / Grand Total:</td>\n              <td style=\"text-align:right; padding:5px 8px;\">${grandTotalFmt} SAR</td>\n            </tr>\n          </table>\n\n          <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;\">\n            <span>\u062b\u0627\u0644\u062b\u0627\u064b: \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0629</span>\n            <span style=\"font-size:11px; font-weight:normal; direction:ltr;\">C) COMMERCIAL TERMS</span>\n          </div>\n          <ul style=\"font-size:11px; line-height:1.6; margin:0; padding-right:18px;\">\n            ${(function() {\n              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);\n              if (terms.length > 0) {\n                return terms.map(t => `\n                  <li>\n                    <b>${t.titleAr} / ${t.titleEn || ''}:</b> ${t.textAr}\n                    ${t.textEn ? `<div style=\"font-size:10px; color:#475569; direction:ltr; text-align:left;\">${t.textEn}</div>` : ''}\n                  </li>\n                `).join('');\n              }\n              return `\n                <li><b>\u0635\u0644\u0627\u062d\u064a\u0629 \u0627\u0644\u0639\u0631\u0636 / Validity:</b> ${q.validityDays || 3} \u0623\u064a\u0627\u0645 \u062a\u0642\u0648\u064a\u0645\u064a\u0629 \u0645\u0646 \u062a\u0627\u0631\u064a\u062e \u0635\u062f\u0648\u0631 \u0627\u0644\u0639\u0631\u0636 (3 calendar days from issuance date).</li>\n                <li><b>\u0627\u0644\u062a\u0648\u0631\u064a\u062f \u0648\u0627\u0644\u062a\u0631\u0643\u064a\u0628 / Supply & Install:</b> ${q.deliveryDays || 30} \u064a\u0648\u0645\u0627\u064b \u0644\u0644\u062a\u0648\u0631\u064a\u062f \u0628\u0627\u0644\u0645\u0635\u0646\u0639\u060c \u0648${q.installDays || 10} \u0623\u064a\u0627\u0645 \u0644\u0644\u062a\u0631\u0643\u064a\u0628 \u0628\u0627\u0644\u0645\u0648\u0642\u0639.</li>\n                <li><b>\u0634\u0631\u0648\u0637 \u0627\u0644\u062f\u0641\u0639 / Payment Terms:</b> 50% \u062f\u0641\u0639\u0629 \u0645\u0642\u062f\u0645\u0629\u060c \u064845% \u0639\u0646\u062f \u062c\u0627\u0647\u0632\u064a\u0629 \u0627\u0644\u0645\u0648\u0627\u062f \u0628\u0627\u0644\u0645\u0635\u0646\u0639\u060c \u06485% \u0639\u0646\u062f \u0627\u0644\u0628\u062f\u0621 \u0628\u0627\u0644\u062a\u0631\u0643\u064a\u0628.</li>\n                <li><b>\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 (*) / Minimum Charge:</b> \u0639\u0644\u0627\u0645\u0629 (*) \u062a\u0639\u0646\u064a \u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u062d\u062f \u0627\u0644\u0623\u062f\u0646\u0649 650 \u0631\u064a\u0627\u0644 \u0644\u0644\u0648\u062d\u062f\u0629 \u0627\u0644\u062a\u064a \u062a\u0642\u0644 \u0639\u0646 1 \u0645\u00b2 (Min. SAR 650 for < 1.0 m\u00b2).</li>\n                <li><b>\u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u0628\u0646\u0643\u064a / Bank Details:</b> \u0645\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062c\u062d\u064a (Al-Rajhi Bank) - IBAN: <b>SA4080000510608010602103</b> \u0628\u0627\u0633\u0645 \u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646.</li>\n              `;\n            })()}\n          </ul>\n\n          <div class=\"footer-sign-container\" style=\"page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;\">\n            <div>\n              <div style=\"font-size:12px;\">\u0634\u0627\u0643\u0631\u064a\u0646 \u0644\u0643\u0645 \u062d\u0633\u0646 \u062a\u0639\u0627\u0648\u0646\u0643\u0645 / Thank you for your business.</div>\n              <div style=\"font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;\">\u0634\u0631\u0643\u0629 \u0628\u0631\u064a\u0643\u0633\u0646 \u0630\u0627\u062a \u0645\u0633\u0624\u0648\u0644\u064a\u0629 \u0645\u062d\u062f\u0648\u062f\u0629 / BRIXEN LLC</div>\n              <div style=\"font-size:11px; color:#666;\">C.R. 7054850701 | \u0633.\u062a 7054850701 - \u0627\u0644\u0631\u064a\u0627\u0636</div>\n            </div>\n            <div style=\"text-align:left;\">\n              <div style=\"border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:11px; font-weight:bold; background:#f9fbfe; border-radius:4px; display:inline-block; margin-bottom:6px;\">\n                BRIXEN LLC<br>\n                C.R. 7054850701<br>\n                \u0639\u0631\u0636 \u0633\u0639\u0631 \u0645\u0639\u062a\u0645\u062f\n              </div>\n            </div>\n          </div>\n        </div>\n      `;\n    },\n\n    previewHistoricalQuote: function(q) {\n      State.activeQuote.referenceNo = q.ReferenceNo;\n      State.activeQuote.customerName = q.CustomerName;\n      State.activeQuote.projectName = q.ProjectName;\n      State.activeQuote.date = q.Date;\n      State.activeQuote.subtotal = q.SubtotalExclVAT;\n      State.activeQuote.vatAmount = q.VATAmount;\n      State.activeQuote.grandTotal = q.GrandTotal;\n      State.activeQuote.language = q.Language || 'AR';\n      this.openLivePreviewModal();\n    },\n\n    showToast: function(message, type) {\n      type = type || 'info';\n      const container = document.getElementById('toastContainer');\n      if (!container) return;\n\n      const toast = document.createElement('div');\n      toast.className = `toast toast-${type}`;\n      toast.textContent = message;\n      container.appendChild(toast);\n\n      setTimeout(() => {\n        toast.style.opacity = '0';\n        setTimeout(() => toast.remove(), 250);\n      }, 4000);\n    }\n  };\n\n  // Run on page load\n  window.addEventListener('DOMContentLoaded', () => {\n    UI.init();\n  });\n\n})();\n\n</script>\n</body>\n</html>\n";
}

// ============================================================================
// CONVENIENCE GLOBAL RUNNERS (Visible in Apps Script Function Dropdown)
// ============================================================================

function runAllServerTests() {
  var results = TestSuite.runAllTests();
  Logger.log('=== TEST SUITE EXECUTION SUMMARY ===');
  Logger.log('Total Tests: ' + results.totalTests);
  Logger.log('Passed: ' + results.passed);
  Logger.log('Failed: ' + results.failed);
  for (var i = 0; i < results.details.length; i++) {
    var d = results.details[i];
    Logger.log('  [' + d.status + '] ' + d.test + (d.error ? ' -> ERROR: ' + d.error : ''));
  }
  return results;
}
