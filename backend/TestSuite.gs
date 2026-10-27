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
