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