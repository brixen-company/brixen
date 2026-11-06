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
