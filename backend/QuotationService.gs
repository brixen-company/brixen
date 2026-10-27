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
