/**
 * BRIXEN Automated Quotation Management Platform
 * File: app.js
 * Description: Client-side application controller, state management, dynamic BOQ grid,
 *              live calculation engine, dual Apps Script/Local API bridge, and document previewer.
 */

(function() {
  'use strict';

  // =========================================================================
  // Application State & Configuration
  // =========================================================================
  const State = {
    currentLang: 'AR', // 'AR' or 'EN'
    currentView: 'dashboard',
    isConnectedToAppsScript: (typeof google !== 'undefined' && google.script && google.script.run),
    
    // Live Database Caches
    dashboard: null,
    customers: [],
    projects: [],
    priceList: [],
    technicalSpecs: [],
    commercialTerms: [],
    quotations: [],
    settings: {},

    // Current Quotation Builder State
    activeQuote: {
      customerId: '',
      customerName: '',
      projectId: '',
      projectName: '',
      referenceNo: 'AUTO',
      date: new Date().toISOString().substring(0, 10),
      language: 'AR',
      languageMode: 'AR',
      validityDays: 3,
      deliveryDays: 30,
      installDays: 10,
      paymentTermsCode: '50-45-5-INSTALL',
      vatRate: 0.15,
      items: []
    },

    // The 4 Outstanding Business Decisions
    decisions: {
      decision1_milestone: {
        title: 'Decision 1: Final 5% Payment Milestone',
        status: 'PENDING',
        selectedOption: 'INSTALL_START', // 'INSTALL_START' (Arabic) or 'HANDOVER' (English)
        notes: 'Arabic quote specifies 5% upon start of installation; English specifies 5% after handover.'
      },
      decision2_validity: {
        title: 'Decision 2: Quotation Validity Standardization',
        status: 'PENDING',
        selectedOption: '3_DAYS', // '3_DAYS' or '7_DAYS'
        notes: 'Arabic quote enforces 3 days; English quote is open-ended. Recommend 3 days.'
      },
      decision3_minCharge: {
        title: 'Decision 3: Rule (*) Minimum Charge Scope',
        status: 'PENDING',
        selectedOption: 'WINDOWS_DOORS_PER_UNIT',
        notes: 'Enforces SAR 650.00 for units < 1.0 m². Clarify scope for commercial/cladding.'
      },
      decision4_priceList: {
        title: 'Decision 4: Approved Pricing List Sign-off',
        status: 'PENDING',
        selectedOption: 'PRELIMINARY_RATES',
        notes: 'Saraya (SAR 650/m²), Cladding (SAR 350/m²), Elevator (SAR 350/m²). Pending executive sign-off.'
      }
    }
  };

  // Default Sample Line Item for BOQ
  function createDefaultItem(code) {
    return {
      itemCode: code || '1',
      category: 'Windows',
      systemId: 'SYS-002',
      descriptionAr: 'توريد وتركيب شباك ثابت/مفصلي قطاع سرايا 105 مم مع زجاج دبل 24 مم GL1',
      descriptionEn: 'Supply and installation of Saraya 105mm fixed/hinged window with 24mm DGU (GL1)',
      width: 1.50,
      height: 1.50,
      unit: 'm',
      count: 1,
      unitAreaM2: 2.25,
      calculatedAreaM2: 2.25,
      billedAreaM2: 2.25,
      unitRate: 650.00,
      isMinimumApplied: false,
      lineTotal: 1462.50,
      notes: ''
    };
  }

  // =========================================================================
  // API Bridge (Supports Google Apps Script RPC + Live REST Cloud + Local Fallback)
  // =========================================================================
  const CONFIG = {
    WEB_APP_URL: 'https://script.google.com/macros/s/AKfycbzdzU9peSAygjR9_rkRDbjuJL8hX1Foi03KfadO0Ti-hzXS8fPrZ8e0sXhc0t3fK2yp/exec'
  };

  const API = {
    callServer: function(action, payload) {
      return new Promise((resolve, reject) => {
        if (State.isConnectedToAppsScript) {
          // Google Apps Script HTML Service direct RPC
          const runner = google.script.run
            .withSuccessHandler(res => resolve(res))
            .withFailureHandler(err => reject(err));
          
          if (typeof runner[action] === 'function') {
            runner[action](payload);
          } else {
            reject(new Error(`Server function ${action} not found.`));
          }
        } else if (CONFIG.WEB_APP_URL) {
          // Live Cloud REST API via Web App URL
          let url = CONFIG.WEB_APP_URL;
          let options = {};
          
          const cleanAction = action.startsWith('api') ? action.charAt(3).toLowerCase() + action.slice(4) : action;
          const getActions = ['getDashboard', 'getCustomers', 'getProjects', 'getPriceList', 'getTechnicalSpecs', 'getCommercialTerms', 'getQuotations', 'getSettings', 'runTestSuite'];

          if (getActions.includes(cleanAction)) {
            url += `?action=${cleanAction}`;
            options = { method: 'GET' };
          } else {
            options = {
              method: 'POST',
              headers: { 'Content-Type': 'text/plain;charset=utf-8' },
              body: JSON.stringify({ action: cleanAction, payload: payload })
            };
          }

          fetch(url, options)
            .then(res => res.json())
            .then(json => {
              if (json && json.success) {
                // Update connection badge to show Live Cloud
                const badge = document.getElementById('connectionBadge');
                if (badge) {
                  badge.textContent = 'متصل سحابياً (Google Sheets Live)';
                  badge.className = 'badge badge-connected';
                }
                resolve(json.data);
              } else {
                throw new Error((json && json.error) || 'Server returned failure');
              }
            })
            .catch(err => {
              console.warn(`Live Cloud call failed for ${action}, falling back to Local Mock:`, err);
              try {
                const mockRes = LocalMockBackend.dispatch(action, payload);
                resolve(mockRes);
              } catch (mockErr) {
                reject(mockErr);
              }
            });
        } else {
          // Local Development & Offline Mock Mode
          setTimeout(() => {
            try {
              const res = LocalMockBackend.dispatch(action, payload);
              resolve(res);
            } catch (e) {
              reject(e);
            }
          }, 120);
        }
      });
    }
  };

  // =========================================================================
  // Local Mock Backend (Allows 100% offline testing with real workspace data)
  // =========================================================================
  const LocalMockBackend = {
    initMockData: function() {
      if (localStorage.getItem('BRIXEN_MOCK_INITIALIZED')) return;

      const mockCustomers = [
        { CustomerID: 'CUST-001', NameAr: 'الأستاذ/ عبد الخالق المري', NameEn: 'Mr. Abdulkhaliq Al-Marri', Phone: '+966 50 123 4567', City: 'Khobar' },
        { CustomerID: 'CUST-002', NameAr: 'المهندس كريس', NameEn: 'Eng. Kris', Phone: '+966 55 987 6543', City: 'Riyadh' }
      ];
      const mockProjects = [
        { ProjectID: 'PROJ-001', CustomerID: 'CUST-001', ProjectNameAr: 'فلة الخبر - أعمال النوافذ والأبواب والكلادينج', ProjectNameEn: 'Khobar Villa Project', Location: 'Khobar' },
        { ProjectID: 'PROJ-002', CustomerID: 'CUST-002', ProjectNameAr: 'مشروع أعمال الألمنيوم والواجهات الزجاجية', ProjectNameEn: 'Kris Architectural Glazing Project', Location: 'Riyadh' }
      ];
      const mockQuotes = [
        {
          QuotationID: 'QT-KHB-001',
          ReferenceNo: 'BRX/QT/KHB/2710/2026',
          CustomerID: 'CUST-001',
          CustomerName: 'الأستاذ/ عبد الخالق المري',
          ProjectName: 'فلة الخبر - أعمال النوافذ والأبواب',
          Date: '2026-10-27',
          Language: 'AR',
          SubtotalExclVAT: 53989.52,
          VATAmount: 8098.43,
          GrandTotal: 62087.95,
          Status: 'ISSUED',
          DocumentURL: '#'
        },
        {
          QuotationID: 'QT-KRIS-002',
          ReferenceNo: 'BRX/QT/KRIS/0909/2026',
          CustomerID: 'CUST-002',
          CustomerName: 'Eng. Kris',
          ProjectName: 'As per Attached Sketches',
          Date: '2026-09-09',
          Language: 'EN',
          SubtotalExclVAT: 40000.00,
          VATAmount: 6000.00,
          GrandTotal: 46000.00,
          Status: 'ISSUED',
          DocumentURL: '#'
        }
      ];

      localStorage.setItem('BRIXEN_CUSTOMERS', JSON.stringify(mockCustomers));
      localStorage.setItem('BRIXEN_PROJECTS', JSON.stringify(mockProjects));
      localStorage.setItem('BRIXEN_QUOTATIONS', JSON.stringify(mockQuotes));
      localStorage.setItem('BRIXEN_MOCK_INITIALIZED', 'true');
    },

    dispatch: function(action, payload) {
      this.initMockData();
      switch (action) {
        case 'apiInitializeDatabase':
          return { spreadsheetId: '16erzJs5DAnegKw_2_7882J3VvBugH7Lar9Rz2jeOviQ', sheetsCreated: ['Settings', 'Customers', 'Projects', 'Quotations'], status: 'SUCCESS' };
        case 'apiGetDashboard':
          const quotes = JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');
          const custs = JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');
          let pipeline = 0;
          quotes.forEach(q => pipeline += (q.GrandTotal || 0));
          return {
            totalQuotations: quotes.length,
            draftCount: 0,
            issuedCount: quotes.length,
            acceptedCount: 0,
            totalPipelineSAR: pipeline,
            recentQuotations: quotes.slice().reverse(),
            customerCount: custs.length
          };
        case 'apiGetCustomers':
          return JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');
        case 'apiSaveCustomer':
          const cList = JSON.parse(localStorage.getItem('BRIXEN_CUSTOMERS') || '[]');
          const newC = Object.assign({}, payload, { CustomerID: 'CUST-' + Math.floor(Math.random()*900+100) });
          cList.push(newC);
          localStorage.setItem('BRIXEN_CUSTOMERS', JSON.stringify(cList));
          return newC;
        case 'apiGetProjects':
          return JSON.parse(localStorage.getItem('BRIXEN_PROJECTS') || '[]');
        case 'apiGetPriceList':
          return [
            { SystemID: 'SYS-001', Category: 'Windows', SystemNameAr: 'قطاع سرايا قلاب 45 مم', SystemNameEn: 'Saraya Hopper 45mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },
            { SystemID: 'SYS-002', Category: 'Windows', SystemNameAr: 'قطاع سرايا مفصلي/ثابت 105 مم', SystemNameEn: 'Saraya Fixed/Hinged 105mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },
            { SystemID: 'SYS-003', Category: 'Doors', SystemNameAr: 'قطاع سرايا أبواب 100 مم', SystemNameEn: 'Saraya Doors 100mm', BaseRateSAR: 650.00, MinChargeSAR: 650.00 },
            { SystemID: 'SYS-004', Category: 'Windows', SystemNameAr: 'رويال سلايدنج 12 سم سحاب', SystemNameEn: 'Royal SLD Series 12cm', BaseRateSAR: 950.00, MinChargeSAR: 750.00 },
            { SystemID: 'SYS-005', Category: 'Cladding', SystemNameAr: 'ألواح كلادينج محلي مضاد للحريق', SystemNameEn: 'Fire-Rated Composite Cladding', BaseRateSAR: 350.00, MinChargeSAR: 500.00 },
            { SystemID: 'SYS-006', Category: 'Elevator', SystemNameAr: 'واجهة مصعد زجاج 10 مم فرملس', SystemNameEn: 'Frameless Glass Elevator 10mm', BaseRateSAR: 350.00, MinChargeSAR: 500.00 }
          ];
        case 'apiGetQuotations':
          return JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');
        case 'apiIssueQuotation':
          const qList = JSON.parse(localStorage.getItem('BRIXEN_QUOTATIONS') || '[]');
          const isDual = (payload.languageMode === 'BOTH' || payload.language === 'BOTH');
          const cleanRef = payload.referenceNo && payload.referenceNo !== 'AUTO' ? payload.referenceNo : 'BRX/QT/' + ('0' + new Date().getDate()).slice(-2) + ('0' + (new Date().getMonth()+1)).slice(-2) + '/' + new Date().getFullYear();
          const newQuote = {
            QuotationID: 'QT-' + Math.floor(Math.random()*9000+1000),
            ReferenceNo: cleanRef,
            CustomerID: payload.customerId || 'CUST-001',
            CustomerName: payload.customerName || 'عميل معتمد',
            ProjectName: payload.projectName || 'مشروع فلل',
            Date: payload.date || new Date().toISOString().substring(0, 10),
            Language: isDual ? 'BOTH' : (payload.language || 'AR'),
            SubtotalExclVAT: payload.subtotal,
            VATAmount: payload.vatAmount,
            GrandTotal: payload.grandTotal,
            Status: 'ISSUED',
            isDual: isDual,
            DocumentURL_AR: '#' + cleanRef + '_AR.pdf',
            DocumentURL_EN: '#' + cleanRef + '_EN.pdf',
            DocumentURL: isDual ? ('#' + cleanRef + '_AR.pdf | #' + cleanRef + '_EN.pdf') : '#'
          };
          qList.push(newQuote);
          localStorage.setItem('BRIXEN_QUOTATIONS', JSON.stringify(qList));
          return {
            success: true,
            quoteRecord: newQuote,
            referenceNo: newQuote.ReferenceNo,
            grandTotal: newQuote.GrandTotal,
            isDual: isDual,
            arabicFile: { fileName: cleanRef + '_AR.pdf', url: '#' },
            englishFile: { fileName: cleanRef + '_EN.pdf', url: '#' }
          };
        default:
          return { success: true };
      }
    }
  };

  // =========================================================================
  // Calculation Engine (Mirrored Client-Side for Instant Real-Time Feedback)
  // =========================================================================
  const CalculationEngine = {
    calculateItemArea: function(width, height, count, unit) {
      const w = parseFloat(width) || 0;
      const h = parseFloat(height) || 0;
      const qty = parseInt(count, 10) || 1;
      const u = (unit || 'm').toLowerCase();

      let singleArea = (u === 'mm') ? (w * h) / 1000000.0 : (w * h);
      let totalArea = singleArea * qty;

      return {
        unitAreaM2: Math.round(singleArea * 1000000) / 1000000,
        totalAreaM2: Math.round(totalArea * 1000000) / 1000000
      };
    },

    recalculateLine: function(item) {
      const areaInfo = this.calculateItemArea(item.width, item.height, item.count, item.unit);
      item.unitAreaM2 = areaInfo.unitAreaM2;
      item.calculatedAreaM2 = areaInfo.totalAreaM2;

      // Check if user manually entered a billed area override (e.g. Cladding 15 m² vs 14.10 m²)
      let billableArea = (item.billedAreaM2 !== undefined && item.billedAreaM2 !== null && parseFloat(item.billedAreaM2) > 0)
        ? parseFloat(item.billedAreaM2)
        : item.calculatedAreaM2;

      const rate = parseFloat(item.unitRate) || 0;
      const qty = parseInt(item.count, 10) || 1;
      let isMin = false;
      let total = 0;

      // Rule (*) evaluation: unit area < 1.00 m²
      const eligible = !item.category || item.category === 'Windows' || item.category === 'Doors';
      if (eligible && item.unitAreaM2 < 1.000 && item.unitAreaM2 > 0) {
        isMin = true;
        total = qty * 650.00; // Flat SAR 650 per unit
      } else {
        total = billableArea * rate;
      }

      item.isMinimumApplied = isMin;
      item.lineTotal = Math.round(total * 100) / 100;
      return item;
    },

    recalculateActiveQuote: function() {
      let subtotal = 0;
      let minCount = 0;

      State.activeQuote.items.forEach(itm => {
        this.recalculateLine(itm);
        subtotal += itm.lineTotal;
        if (itm.isMinimumApplied) minCount++;
      });

      subtotal = Math.round(subtotal * 100) / 100;
      const vatRate = State.activeQuote.vatRate || 0.15;
      const vatAmount = Math.round(subtotal * vatRate * 100) / 100;
      const grandTotal = Math.round((subtotal + vatAmount) * 100) / 100;

      State.activeQuote.subtotal = subtotal;
      State.activeQuote.vatAmount = vatAmount;
      State.activeQuote.grandTotal = grandTotal;
      State.activeQuote.minimumSurchargeCount = minCount;

      UI.updateSummaryBox();
    }
  };

  // =========================================================================
  // UI Controller & View Manager
  // =========================================================================
  // =========================================================================
  // Master Commercial Terms & Conditions Library
  // =========================================================================
  const DEFAULT_MASTER_TERMS = [
    {
      id: 'TERM-01',
      category: 'Validity',
      categoryNameAr: 'صلاحية العرض',
      titleAr: 'صلاحية عرض السعر',
      titleEn: 'Quotation Validity',
      textAr: 'صلاحية العرض 3 أيام تقويمية من تاريخ صدوره نظراً لتقلبات أسعار خام الألمنيوم والزجاج في السوق.',
      textEn: 'Offer validity is 3 calendar days from quotation date due to market price fluctuations of raw aluminum and glass.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-02',
      category: 'Payment',
      categoryNameAr: 'الدفعات المالية',
      titleAr: 'شروط وجدول الدفعات',
      titleEn: 'Payment Terms & Schedule',
      textAr: '50% دفعة مقدمة عند توقيع العقد، و45% عند جاهزية المواد بالمصنع وقبل الشحن، و5% عند بدء أعمال التركيب بالموقع.',
      textEn: '50% advance upon contract signing, 45% upon materials factory readiness prior to dispatch, and 5% upon start of site installation.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-03',
      category: 'Schedule',
      categoryNameAr: 'التوريد والتركيب',
      titleAr: 'الجدول الزمني للتوريد والتركيب',
      titleEn: 'Fabrication & Installation Schedule',
      textAr: 'مدة التوريد والتصنيع 30 يوماً تقويمياً من تاريخ اعتماد الرفع المساحي والرسومات التنفيذية، و10 أيام لأعمال التركيب بالموقع.',
      textEn: 'Fabrication period is 30 calendar days from approval of site measurements and shop drawings, and 10 days for site installation.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-04',
      category: 'SiteWork',
      categoryNameAr: 'الرفع المساحي',
      titleAr: 'الرفع المساحي والاعتماد الميداني',
      titleEn: 'Site Survey & Architectural Verification',
      textAr: 'كافة المقاسات والفتحات المعمارية خاضعة للرفع المساحي الميداني والاعتماد الهندسي قبل البدء بقص وسحب الألمنيوم.',
      textEn: 'All dimensions and architectural openings are subject to final site survey and engineering verification prior to fabrication.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-05',
      category: 'Pricing',
      categoryNameAr: 'الحد الأدنى',
      titleAr: 'قاعدة الحد الأدنى للمقاسات الصغيرة (*)',
      titleEn: 'Minimum Unit Charge Rule (*)',
      textAr: 'علامة (*) تشير إلى تطبيق الحد الأدنى بقيمة 650 ريال للوحدة التي تقل مساحتها عن 1.00 م² لتغطية تكاليف التصنيع والهوالك التشغيلية.',
      textEn: 'Asterisk (*) indicates application of the statutory minimum rate of SAR 650.00 for units under 1.00 m² to cover fabrication overheads.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-06',
      category: 'Bank',
      categoryNameAr: 'الحساب البنكي',
      titleAr: 'الحساب البنكي المعتمد حصراً',
      titleEn: 'Authorized Banking Details',
      textAr: 'التحويل حصراً إلى الحساب البنكي الرسمي باسم شركة بريكسن لدى مصرف الراجحي - آيبان: SA4080000510608010602103 ولا يُعتد بأي سداد نقدي خارج الحساب.',
      textEn: 'Payments must be transferred exclusively to BRIXEN LLC official bank account at Al-Rajhi Bank - IBAN: SA4080000510608010602103.',
      isDefault: true,
      isSelected: true
    },
    {
      id: 'TERM-07',
      category: 'Warranty',
      categoryNameAr: 'الضمان المعتمد',
      titleAr: 'شهادة الضمان وجودة المواد',
      titleEn: 'Warranty & Material Assurance',
      textAr: 'ضمان لمدة 10 سنوات على ثبات قطاعات الألمنيوم ومقاومة العوامل الجوية، وضمان سنة واحدة على الإكسسوارات والمفصلات الميكانيكية ضد عيوب التصنيع.',
      textEn: '10-year warranty on aluminum profiles and architectural surface finish, and 1-year warranty on mechanical hardware against defects.',
      isDefault: false,
      isSelected: false
    }
  ];

  const UI = {
    init: function() {
      this.initTermsLibrary();
      this.bindNavigation();
      this.bindQuoteBuilderEvents();
      this.bindTermsEvents();
      this.loadInitialData();
      this.setupDefaultQuote();
      this.renderQuoteTermsChecklist();
      this.renderMasterTermsLibrary();
    },

    initTermsLibrary: function() {
      let stored = localStorage.getItem('BRIXEN_TERMS_LIBRARY');
      if (!stored) {
        localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(DEFAULT_MASTER_TERMS));
        State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));
      } else {
        try {
          State.masterTerms = JSON.parse(stored);
        } catch (e) {
          State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));
        }
      }
      // Populate activeQuote.selectedTerms from master terms
      State.activeQuote.selectedTerms = State.masterTerms.map(t => Object.assign({}, t, {
        isSelected: (t.isDefault !== false)
      }));
    },

    bindNavigation: function() {
      document.querySelectorAll('.nav-link').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const targetView = btn.getAttribute('data-view');
          if (targetView) this.switchView(targetView);
        });
      });

      // Language Switcher
      const langToggle = document.getElementById('langToggleBtn');
      if (langToggle) {
        langToggle.addEventListener('click', () => {
          State.currentLang = (State.currentLang === 'AR') ? 'EN' : 'AR';
          document.documentElement.setAttribute('dir', State.currentLang === 'AR' ? 'rtl' : 'ltr');
          document.documentElement.setAttribute('lang', State.currentLang.toLowerCase());
          langToggle.textContent = (State.currentLang === 'AR') ? 'English' : 'عربي';
          this.switchLanguageLabels(State.currentLang);
        });
      }
    },

    switchView: function(viewName) {
      State.currentView = viewName;
      document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
      document.querySelectorAll('.nav-link').forEach(btn => btn.classList.remove('active'));

      const activeSec = document.getElementById(`view-${viewName}`);
      const activeBtn = document.querySelector(`.nav-link[data-view="${viewName}"]`);

      if (activeSec) activeSec.classList.add('active');
      if (activeBtn) activeBtn.classList.add('active');

      if (viewName === 'dashboard') this.renderDashboard();
      if (viewName === 'history') this.renderHistoryTable();
      if (viewName === 'customers') this.renderCustomersTable();
      if (viewName === 'pricelist') this.renderPriceListTable();
      if (viewName === 'decisions') this.renderMasterTermsLibrary();
    },

    switchLanguageLabels: function(lang) {
      // Toggle language mode on UI
      const isAr = lang === 'AR';
      State.activeQuote.language = lang;
      State.activeQuote.deliveryDays = isAr ? 30 : 20;
      State.activeQuote.validityDays = isAr ? 3 : 7;
      CalculationEngine.recalculateActiveQuote();
    },

    setupDefaultQuote: function() {
      State.activeQuote.items = [
        createDefaultItem('W1'),
        {
          itemCode: 'W4', category: 'Windows', systemId: 'SYS-001',
          descriptionAr: 'توريد وتركيب شباك قلاب- غرفة الشغالة (0.40 × 0.60 م) - زجاج مثلج',
          descriptionEn: 'Supply & install tilt/hopper window (0.40 x 0.60 m) - frosted glass',
          width: 0.40, height: 0.60, unit: 'm', count: 1,
          unitAreaM2: 0.24, calculatedAreaM2: 0.24, billedAreaM2: 0.24,
          unitRate: 650.00, isMinimumApplied: true, lineTotal: 650.00, notes: 'طبق الحد الأدنى (*)'
        },
        {
          itemCode: 'D1', category: 'Doors', systemId: 'SYS-003',
          descriptionAr: 'توريد وتركيب باب مدخل النساء- خارجي - زجاج كامل (1.025 × 2.20 م)',
          descriptionEn: 'Supply & install women entrance door - full glass (1.025 x 2.20 m)',
          width: 1.025, height: 2.20, unit: 'm', count: 1,
          unitAreaM2: 2.255, calculatedAreaM2: 2.255, billedAreaM2: 2.255,
          unitRate: 650.00, isMinimumApplied: false, lineTotal: 1465.75, notes: ''
        }
      ];
      this.renderBOQRows();
      CalculationEngine.recalculateActiveQuote();
    },

    renderBOQRows: function() {
      const tbody = document.getElementById('boqTableBody');
      if (!tbody) return;

      tbody.innerHTML = '';
      State.activeQuote.items.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;

        const isMin = item.isMinimumApplied;
        const star = isMin ? '<span class="rule-flag" title="تم تطبيق الحد الأدنى 650 ريال">*</span>' : '';

        tr.innerHTML = `
          <td style="text-align:center;"><input type="text" class="table-input item-code" value="${item.itemCode || (index + 1)}" style="text-align:center; width:50px;"></td>
          <td>
            <select class="table-input item-category" style="width:100px;">
              <option value="Windows" ${item.category === 'Windows' ? 'selected' : ''}>شباك</option>
              <option value="Doors" ${item.category === 'Doors' ? 'selected' : ''}>باب</option>
              <option value="Cladding" ${item.category === 'Cladding' ? 'selected' : ''}>كلادينج</option>
              <option value="Elevator" ${item.category === 'Elevator' ? 'selected' : ''}>مصعد</option>
            </select>
          </td>
          <td>
            <input type="text" class="table-input item-desc-ar" value="${item.descriptionAr || ''}" placeholder="الوصف بالعربية (تيمبليت العربي)..." title="الوصف باللغة العربية لتيمبليت العرض العربي">
            <input type="text" class="table-input item-desc-en" value="${item.descriptionEn || ''}" placeholder="English description (English template)..." dir="ltr" style="font-size:11.5px; margin-top:4px; color:#475569; border-color:#e2e8f0;" title="Description in English for English template">
          </td>
          <td><input type="number" step="0.01" class="table-input item-w" value="${item.width}" style="text-align:center; width:65px;"></td>
          <td><input type="number" step="0.01" class="table-input item-h" value="${item.height}" style="text-align:center; width:65px;"></td>
          <td><input type="number" min="1" class="table-input item-qty" value="${item.count}" style="text-align:center; width:55px;"></td>
          <td style="text-align:center; font-weight:600;">${item.calculatedAreaM2.toFixed(3)} م²</td>
          <td><input type="number" step="10" class="table-input item-rate" value="${item.unitRate}" style="text-align:right; width:80px;"></td>
          <td style="text-align:right; font-weight:bold; color:var(--corporate-navy);">${item.lineTotal.toLocaleString('en-US', {minimumFractionDigits:2})} ${star}</td>
          <td style="text-align:center;">
            <button type="button" class="btn btn-sm btn-secondary btn-del-row" title="حذف البند">✕</button>
          </td>
        `;

        // Wire change listeners on inputs for live calculation
        tr.querySelector('.item-code').addEventListener('input', (e) => { item.itemCode = e.target.value; });
        tr.querySelector('.item-category').addEventListener('change', (e) => { item.category = e.target.value; CalculationEngine.recalculateActiveQuote(); });
        tr.querySelector('.item-desc-ar').addEventListener('input', (e) => { 
          item.descriptionAr = e.target.value;
          // Auto-suggest English if empty
          if (!item.descriptionEn || item.descriptionEn.trim() === '') {
            item.descriptionEn = `Supply and installation of ${item.category} architectural unit (${item.width} x ${item.height} m)`;
            const enInput = tr.querySelector('.item-desc-en');
            if (enInput) enInput.value = item.descriptionEn;
          }
        });
        tr.querySelector('.item-desc-en').addEventListener('input', (e) => { 
          item.descriptionEn = e.target.value;
        });
        tr.querySelector('.item-w').addEventListener('input', (e) => { item.width = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });
        tr.querySelector('.item-h').addEventListener('input', (e) => { item.height = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });
        tr.querySelector('.item-qty').addEventListener('input', (e) => { item.count = parseInt(e.target.value, 10) || 1; CalculationEngine.recalculateActiveQuote(); });
        tr.querySelector('.item-rate').addEventListener('input', (e) => { item.unitRate = parseFloat(e.target.value) || 0; CalculationEngine.recalculateActiveQuote(); });
        
        tr.querySelector('.btn-del-row').addEventListener('click', () => {
          if (State.activeQuote.items.length <= 1) {
            UI.showToast('يجب الإبقاء على بند واحد على الأقل.', 'error');
            return;
          }
          State.activeQuote.items.splice(index, 1);
          UI.renderBOQRows();
          CalculationEngine.recalculateActiveQuote();
        });

        tbody.appendChild(tr);
      });
    },

    updateSummaryBox: function() {
      const q = State.activeQuote;
      const subtotalEl = document.getElementById('sumSubtotal');
      const vatEl = document.getElementById('sumVAT');
      const grandTotalEl = document.getElementById('sumGrandTotal');
      const minAlertEl = document.getElementById('minChargeAlertBox');

      if (subtotalEl) subtotalEl.textContent = `${(q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;
      if (vatEl) vatEl.textContent = `${(q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;
      if (grandTotalEl) grandTotalEl.textContent = `${(q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`;

      if (minAlertEl) {
        if (q.minimumSurchargeCount > 0) {
          minAlertEl.style.display = 'block';
          minAlertEl.textContent = `ملاحظة: تم تطبيق الحد الأدنى (650 ريال) تلقائياً على عدد (${q.minimumSurchargeCount}) فتحات تقل مساحتها عن 1.0 م² وفقاً للقاعدة المعتمدة (*).`;
        } else {
          minAlertEl.style.display = 'none';
        }
      }
    },

    bindQuoteBuilderEvents: function() {
      // Add BOQ Row Button
      const addRowBtn = document.getElementById('addBoqRowBtn');
      if (addRowBtn) {
        addRowBtn.addEventListener('click', () => {
          const nextIndex = State.activeQuote.items.length + 1;
          State.activeQuote.items.push(createDefaultItem(`W${nextIndex}`));
          this.renderBOQRows();
          CalculationEngine.recalculateActiveQuote();
        });
      }

      // Customer Selection Change
      const custSelect = document.getElementById('quoteCustomerSelect');
      if (custSelect) {
        custSelect.addEventListener('change', (e) => {
          const custId = e.target.value;
          const found = State.customers.find(c => c.CustomerID === custId);
          if (found) {
            State.activeQuote.customerId = found.CustomerID;
            State.activeQuote.customerName = found.NameAr || found.NameEn;
            document.getElementById('quoteCustomerNameInput').value = State.activeQuote.customerName;
          }
        });
      }

      // One-Click Issuance Button
      const issueBtn = document.getElementById('issueQuotationBtn');
      if (issueBtn) {
        issueBtn.addEventListener('click', () => this.handleIssueQuotation());
      }

      // Live Preview Button
      const previewBtn = document.getElementById('livePreviewBtn');
      if (previewBtn) {
        previewBtn.addEventListener('click', () => this.openLivePreviewModal());
      }

      // Close Modal Buttons
      document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
      });

      // Language Mode Radio Listener (AR only, EN only, BOTH 2-PDF files)
      document.querySelectorAll('input[name="docLanguageMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          State.activeQuote.languageMode = e.target.value;
          State.activeQuote.language = e.target.value;
        });
      });

      // Modal Preview File Switch Buttons Listener (Arabic PDF vs English PDF)
      document.querySelectorAll('.btn-preview-file-switch').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetFile = btn.getAttribute('data-file');
          UI.switchModalPreviewFile(targetFile);
        });
      });
    },

    bindDecisionEvents: function() {
      // Decision toggle listeners
      document.querySelectorAll('.decision-toggle-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const decisionKey = btn.getAttribute('data-decision');
          const optionVal = btn.getAttribute('data-option');
          if (State.decisions[decisionKey]) {
            State.decisions[decisionKey].selectedOption = optionVal;
            State.decisions[decisionKey].status = 'CONFIRMED';
            UI.showToast(`تم تحديث ${State.decisions[decisionKey].title} بنجاح.`, 'success');
            btn.parentElement.querySelectorAll('.decision-toggle-btn').forEach(b => b.classList.remove('btn-primary'));
            btn.classList.add('btn-primary');
          }
        });
      });
    },


    renderQuoteTermsChecklist: function() {
      const container = document.getElementById('quoteTermsListContainer');
      if (!container) return;

      container.innerHTML = '';
      if (!State.activeQuote.selectedTerms || State.activeQuote.selectedTerms.length === 0) {
        container.innerHTML = '<div style="color:#888; font-size:13px; padding:8px;">لا توجد شروط مضافة لهذا العرض. يمكنك الضغط على زر إضافة شرط مخصص بالأعلى.</div>';
        return;
      }

      State.activeQuote.selectedTerms.forEach((term, idx) => {
        const el = document.createElement('div');
        el.className = 'term-card' + (term.isSelected ? ' selected' : '');
        el.innerHTML = `
          <input type="checkbox" class="term-checkbox" data-idx="${idx}" ${term.isSelected ? 'checked' : ''} title="تضمين في العرض">
          <div class="term-content">
            <div class="term-title-row">
              <span class="term-title">${term.titleAr || term.titleEn || 'بند شرط'}</span>
              <span class="badge-cat">${term.categoryNameAr || term.category || 'شرط'}</span>
            </div>
            <div class="term-text-ar">${term.textAr || ''}</div>
            ${term.textEn ? `<div class="term-text-en">${term.textEn}</div>` : ''}
          </div>
          <div class="term-actions">
            <button type="button" class="btn btn-sm btn-secondary btn-edit-quote-term" data-idx="${idx}" title="تعديل صياغة الشرط">✏️</button>
            <button type="button" class="btn btn-sm btn-secondary btn-del-quote-term" data-idx="${idx}" title="حذف هذا الشرط">✕</button>
          </div>
        `;

        el.querySelector('.term-checkbox').addEventListener('change', (e) => {
          term.isSelected = e.target.checked;
          el.classList.toggle('selected', term.isSelected);
        });

        el.querySelector('.btn-edit-quote-term').addEventListener('click', () => {
          UI.openTermEditModal(idx, 'QUOTE');
        });

        el.querySelector('.btn-del-quote-term').addEventListener('click', () => {
          State.activeQuote.selectedTerms.splice(idx, 1);
          UI.renderQuoteTermsChecklist();
          UI.showToast('تم حذف الشرط من هذا العرض.', 'info');
        });

        container.appendChild(el);
      });
    },

    renderMasterTermsLibrary: function() {
      const container = document.getElementById('masterTermsContainer');
      if (!container) return;

      container.innerHTML = '';
      if (!State.masterTerms || State.masterTerms.length === 0) {
        container.innerHTML = '<div style="color:#888; font-size:13px; padding:12px;">المكتبة فارغة. اضغط على زر «استعادة الشروط الافتراضية» لاسترجاع الشروط المعيارية.</div>';
        return;
      }

      State.masterTerms.forEach((term, idx) => {
        const el = document.createElement('div');
        el.className = 'term-card selected';
        el.innerHTML = `
          <div class="term-content">
            <div class="term-title-row">
              <span class="term-title">${term.titleAr || term.titleEn}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="badge-cat">${term.categoryNameAr || term.category || 'سياسة'}</span>
                <span style="font-size:11px; color:#64748b; font-weight:600;">${term.isDefault ? '✓ افتراضي لكل عرض' : 'اختياري'}</span>
              </div>
            </div>
            <div class="term-text-ar" style="font-size:13px; line-height:1.6;">${term.textAr || ''}</div>
            ${term.textEn ? `<div class="term-text-en" style="font-size:12px; margin-top:4px;">${term.textEn}</div>` : ''}
          </div>
          <div class="term-actions">
            <button type="button" class="btn btn-sm btn-primary btn-edit-master-term" data-idx="${idx}" title="تعديل هذا الشرط">✏️ تعديل</button>
            <button type="button" class="btn btn-sm btn-secondary btn-del-master-term" data-idx="${idx}" title="حذف هذا الشرط">🗑️ حذف</button>
          </div>
        `;

        el.querySelector('.btn-edit-master-term').addEventListener('click', () => {
          UI.openTermEditModal(idx, 'MASTER');
        });

        el.querySelector('.btn-del-master-term').addEventListener('click', () => {
          if (confirm('هل أنت متأكد من حذف هذا الشرط من المكتبة العامة؟')) {
            State.masterTerms.splice(idx, 1);
            localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(State.masterTerms));
            UI.renderMasterTermsLibrary();
            UI.showToast('تم حذف الشرط من المكتبة بنجاح.', 'info');
          }
        });

        container.appendChild(el);
      });
    },

    openTermEditModal: function(targetIndex, scope) {
      const modal = document.getElementById('termEditModal');
      if (!modal) return;

      const titleEl = document.getElementById('termModalTitle');
      const idInput = document.getElementById('editTermId');
      const scopeInput = document.getElementById('editTermScope');
      const termTitleInput = document.getElementById('editTermTitle');
      const termTextAr = document.getElementById('editTermTextAr');
      const termTextEn = document.getElementById('editTermTextEn');
      const defaultCheck = document.getElementById('editTermDefaultChecked');

      idInput.value = targetIndex;
      scopeInput.value = scope;

      if (targetIndex >= 0) {
        // Editing existing term
        const list = (scope === 'MASTER') ? State.masterTerms : State.activeQuote.selectedTerms;
        const item = list[targetIndex];
        if (item) {
          titleEl.textContent = (scope === 'MASTER') ? 'تعديل شرط في المكتبة العامة' : 'تعديل شرط لهذا العرض';
          termTitleInput.value = item.titleAr || item.titleEn || '';
          termTextAr.value = item.textAr || '';
          termTextEn.value = item.textEn || '';
          defaultCheck.checked = (item.isDefault !== false);
        }
      } else {
        // Adding new term
        titleEl.textContent = (scope === 'MASTER') ? 'إضافة شرط جديد للمكتبة العامة' : 'إضافة شرط مخصص لهذا العرض';
        termTitleInput.value = '';
        termTextAr.value = '';
        termTextEn.value = '';
        defaultCheck.checked = true;
      }

      modal.classList.add('active');
    },

    saveTermFromModal: function() {
      const targetIndex = parseInt(document.getElementById('editTermId').value, 10);
      const scope = document.getElementById('editTermScope').value;
      const title = document.getElementById('editTermTitle').value.trim();
      const textAr = document.getElementById('editTermTextAr').value.trim();
      const textEn = document.getElementById('editTermTextEn').value.trim();
      const isDefault = document.getElementById('editTermDefaultChecked').checked;

      if (!title || !textAr) {
        UI.showToast('يرجى كتابة عنوان الشرط ونص الشرط باللغة العربية.', 'error');
        return;
      }

      if (scope === 'MASTER') {
        if (targetIndex >= 0 && State.masterTerms[targetIndex]) {
          State.masterTerms[targetIndex].titleAr = title;
          State.masterTerms[targetIndex].textAr = textAr;
          State.masterTerms[targetIndex].textEn = textEn;
          State.masterTerms[targetIndex].isDefault = isDefault;
        } else {
          State.masterTerms.push({
            id: 'TERM-' + Math.floor(Math.random() * 9000 + 1000),
            category: 'Custom',
            categoryNameAr: 'مخصص',
            titleAr: title,
            titleEn: title,
            textAr: textAr,
            textEn: textEn,
            isDefault: isDefault,
            isSelected: true
          });
        }
        localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(State.masterTerms));
        this.renderMasterTermsLibrary();
        UI.showToast('تم حفظ الشرط في المكتبة العامة بنجاح.', 'success');
      } else {
        // Scope is QUOTE
        if (targetIndex >= 0 && State.activeQuote.selectedTerms[targetIndex]) {
          State.activeQuote.selectedTerms[targetIndex].titleAr = title;
          State.activeQuote.selectedTerms[targetIndex].textAr = textAr;
          State.activeQuote.selectedTerms[targetIndex].textEn = textEn;
          State.activeQuote.selectedTerms[targetIndex].isSelected = true;
        } else {
          State.activeQuote.selectedTerms.push({
            id: 'QTERM-' + Math.floor(Math.random() * 9000 + 1000),
            category: 'Custom',
            categoryNameAr: 'مخصص',
            titleAr: title,
            titleEn: title,
            textAr: textAr,
            textEn: textEn,
            isDefault: false,
            isSelected: true
          });
        }
        this.renderQuoteTermsChecklist();
        UI.showToast('تم تطبيق الشرط على هذا العرض بنجاح.', 'success');
      }

      document.getElementById('termEditModal').classList.remove('active');
    },

    bindTermsEvents: function() {
      // Add custom term button in View 2
      const btnAddQuoteTerm = document.getElementById('btnAddCustomTermToQuoteBtn');
      if (btnAddQuoteTerm) {
        btnAddQuoteTerm.addEventListener('click', () => UI.openTermEditModal(-1, 'QUOTE'));
      }

      // Add new master term button in View 6
      const btnAddMasterTerm = document.getElementById('btnAddNewMasterTerm');
      if (btnAddMasterTerm) {
        btnAddMasterTerm.addEventListener('click', () => UI.openTermEditModal(-1, 'MASTER'));
      }

      // Reset default terms button in View 6
      const btnReset = document.getElementById('btnResetDefaultTerms');
      if (btnReset) {
        btnReset.addEventListener('click', () => {
          if (confirm('هل تريد استعادة قائمة الشروط والسياسات الافتراضية المعتمدة لشركة بريكسن؟')) {
            localStorage.setItem('BRIXEN_TERMS_LIBRARY', JSON.stringify(DEFAULT_MASTER_TERMS));
            State.masterTerms = JSON.parse(JSON.stringify(DEFAULT_MASTER_TERMS));
            UI.renderMasterTermsLibrary();
            State.activeQuote.selectedTerms = State.masterTerms.map(t => Object.assign({}, t, { isSelected: (t.isDefault !== false) }));
            UI.renderQuoteTermsChecklist();
            UI.showToast('تمت استعادة الشروط الافتراضية بنجاح.', 'success');
          }
        });
      }

      // Modal save button
      const btnSave = document.getElementById('btnSaveTermModal');
      if (btnSave) {
        btnSave.addEventListener('click', () => UI.saveTermFromModal());
      }

      // Close modal buttons
      document.querySelectorAll('.close-term-modal-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const m = document.getElementById('termEditModal');
          if (m) m.classList.remove('active');
        });
      });
    },

    loadInitialData: function() {
      API.callServer('apiGetDashboard').then(data => {
        State.dashboard = data;
        this.renderDashboard();
      }).catch(err => console.warn('Dashboard load error:', err));

      API.callServer('apiGetCustomers').then(data => {
        State.customers = data || [];
        this.populateCustomerDropdown();
      }).catch(err => console.warn('Customers load error:', err));

      API.callServer('apiGetPriceList').then(data => {
        State.priceList = data || [];
      }).catch(err => console.warn('Price list load error:', err));
    },

    populateCustomerDropdown: function() {
      const select = document.getElementById('quoteCustomerSelect');
      if (!select) return;
      select.innerHTML = '<option value="">-- اختر العميل أو أدخل اسماً جديداً --</option>';
      State.customers.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.CustomerID;
        opt.textContent = `${c.NameAr || c.NameEn} (${c.City || 'السعودية'})`;
        select.appendChild(opt);
      });
      // Default to Khobar Villa
      if (State.customers.length > 0) {
        select.value = State.customers[0].CustomerID;
        State.activeQuote.customerId = State.customers[0].CustomerID;
        State.activeQuote.customerName = State.customers[0].NameAr || State.customers[0].NameEn;
        const custInput = document.getElementById('quoteCustomerNameInput');
        if (custInput) custInput.value = State.activeQuote.customerName;
      }
    },

    renderDashboard: function() {
      if (!State.dashboard) return;
      const d = State.dashboard;
      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

      setText('kpiTotalQuotes', d.totalQuotations || 0);
      setText('kpiIssuedQuotes', d.issuedCount || 0);
      setText('kpiPipelineSAR', `${(d.totalPipelineSAR || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR`);
      setText('kpiTotalCustomers', d.customerCount || State.customers.length || 0);

      const recentTbody = document.getElementById('dashboardRecentQuotesTable');
      if (recentTbody && d.recentQuotations) {
        recentTbody.innerHTML = '';
        d.recentQuotations.forEach(q => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight:bold;">${q.ReferenceNo || 'BRX-NEW'}</td>
            <td>${q.CustomerName || '-'}</td>
            <td>${q.ProjectName || '-'}</td>
            <td>${q.Date || '-'}</td>
            <td style="font-weight:bold; color:var(--corporate-navy);">${(q.GrandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2})} SAR</td>
            <td><span class="badge badge-connected">${q.Status || 'ISSUED'}</span></td>
            <td>
              <button class="btn btn-sm btn-secondary btn-view-quote" data-id="${q.QuotationID}">عرض</button>
            </td>
          `;
          tr.querySelector('.btn-view-quote').addEventListener('click', () => {
            this.previewHistoricalQuote(q);
          });
          recentTbody.appendChild(tr);
        });
      }
    },

    handleIssueQuotation: function() {
      const q = State.activeQuote;
      q.customerName = document.getElementById('quoteCustomerNameInput').value.trim() || q.customerName;
      q.projectName = document.getElementById('quoteProjectNameInput').value.trim() || 'مشروع سكني';
      q.date = document.getElementById('quoteDateInput').value || q.date;

      const selectedRadio = document.querySelector('input[name="docLanguageMode"]:checked');
      const mode = selectedRadio ? selectedRadio.value : (q.languageMode || 'AR');
      q.languageMode = mode;
      q.language = mode;

      if (!q.customerName) {
        UI.showToast('يرجى كتابة اسم العميل.', 'error');
        return;
      }

      UI.showToast('جاري التحقق والاحتساب وتوليد ملفات PDF...', 'info');

      API.callServer('apiIssueQuotation', q).then(res => {
        q.referenceNo = res.referenceNo;
        if (res.isDual || mode === 'BOTH') {
          UI.showToast(`تم توليد وإصدار ملفين منفصلين بنجاح (عرض السعر العربي + عرض السعر الإنجليزي 100%) برقم: ${res.referenceNo}`, 'success');
        } else {
          UI.showToast(`تم إصدار عرض السعر بنجاح برقم: ${res.referenceNo}`, 'success');
        }
        this.openLivePreviewModal();
        this.loadInitialData(); // Refresh history
      }).catch(err => {
        UI.showToast('حدث خطأ أثناء إصدار العرض: ' + err.message, 'error');
      });
    },

    switchModalPreviewFile: function(fileLang) {
      document.querySelectorAll('.btn-preview-file-switch').forEach(btn => {
        if (btn.getAttribute('data-file') === fileLang) {
          btn.classList.remove('btn-secondary');
          btn.classList.add('btn-primary');
        } else {
          btn.classList.remove('btn-primary');
          btn.classList.add('btn-secondary');
        }
      });

      const container = document.getElementById('modalPreviewContainer');
      if (!container) return;
      const q = State.activeQuote;

      if (fileLang === 'EN') {
        container.innerHTML = this.buildEnglishQuotationHTML(q);
      } else {
        container.innerHTML = this.buildArabicQuotationHTML(q);
      }
      State.activePreviewFile = fileLang;
    },

    openLivePreviewModal: function() {
      const modal = document.getElementById('previewModal');
      if (!modal) return;

      const q = State.activeQuote;
      q.customerName = document.getElementById('quoteCustomerNameInput').value.trim() || q.customerName;
      q.projectName = document.getElementById('quoteProjectNameInput').value.trim() || 'مشروع سكني';
      q.date = document.getElementById('quoteDateInput').value || q.date;

      const selectedRadio = document.querySelector('input[name="docLanguageMode"]:checked');
      const mode = selectedRadio ? selectedRadio.value : (q.languageMode || 'AR');
      q.languageMode = mode;
      q.language = mode;

      // Initial preview sheet: EN if English only, else AR
      const initialFile = (mode === 'EN') ? 'EN' : 'AR';
      this.switchModalPreviewFile(initialFile);

      modal.classList.add('active');

      // Print currently displayed file
      const printBtn = document.getElementById('printQuotationBtn');
      if (printBtn) {
        printBtn.onclick = () => window.print();
      }

      // Print Arabic file directly
      const printArBtn = document.getElementById('printArabicOnlyBtn');
      if (printArBtn) {
        printArBtn.onclick = () => {
          this.switchModalPreviewFile('AR');
          setTimeout(() => window.print(), 150);
        };
      }

      // Print English file directly
      const printEnBtn = document.getElementById('printEnglishOnlyBtn');
      if (printEnBtn) {
        printEnBtn.onclick = () => {
          this.switchModalPreviewFile('EN');
          setTimeout(() => window.print(), 150);
        };
      }
    },

    buildArabicQuotationHTML: function(q) {
      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});

      let rowsHtml = '';
      q.items.forEach((itm, idx) => {
        const star = itm.isMinimumApplied ? '*' : '';
        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;
        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
        const desc = itm.descriptionAr || itm.descriptionEn;

        rowsHtml += `<tr>
          <td style="text-align:center; font-weight:bold;">${itm.itemCode || (idx+1)}</td>
          <td style="text-align:right;">${desc}</td>
          <td style="text-align:center;">${itm.count}</td>
          <td style="text-align:center;">${areaDisp} م²</td>
          <td style="text-align:center;">م²</td>
          <td style="text-align:right;">${rateDisp}</td>
          <td style="text-align:right; font-weight:bold;">${totalDisp}</td>
        </tr>`;
      });

      return `
        <div class="a4-sheet" dir="rtl">
          <div style="border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:22px; font-weight:800; color:#111; letter-spacing:1px;">BRI<span style="color:#E30613;">X</span>EN <span style="font-size:14px;">LLC</span></div>
              <div style="font-size:11px; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>
              <div style="font-size:11px; color:#555;">www.brixenco.com | info@brixenco.com</div>
            </div>
            <div style="text-align:left;">
              <div style="font-size:18px; font-weight:bold; color:#1F4E79;">عرض توريد وتركيب معتمد</div>
              <div style="font-size:11px; color:#666;">المرجع: ${q.referenceNo}</div>
            </div>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;">المرجع:</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.referenceNo}</td>
              <td style="background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;">التاريخ:</td>
              <td style="padding:5px 8px;">${q.date}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">إلى (العميل):</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.customerName}</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">المشروع:</td>
              <td style="padding:5px 8px;">${q.projectName}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">الموضوع:</td>
              <td style="padding:5px 8px;">أعمال الألمنيوم والزجاج والكلادينج</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">العملة:</td>
              <td style="padding:5px 8px;">الريال السعودي (SAR)</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">الأساس:</td>
              <td style="padding:5px 8px;">الكميات والأبعاد الواردة في جداول المشروع</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">التسعير:</td>
              <td style="padding:5px 8px;">يشمل التوريد والتصنيع والنقل والتركيب</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            أولاً: المواصفات الفنية المعتمدة
          </div>
          <div style="font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;">
            • <b>الألمنيوم:</b> قطاع القلاب سرايا 45 مم (سماكة 1.5 مم) للحمامات. قطاع النوافذ 105 مم (سماكة 1.5 مم). قطاع الأبواب سرايا 100 مم (سماكة 2 مم).<br>
            • <b>الزجاج:</b> GL1: 24 مم دبل شفاف مقوى. GL2: 24 مم دبل مثلج مقوى للحمامات. GL3: 10 مم زجاج مصعد فرملس مقوى.<br>
            • <b>الإكسسوارات والسيليكون:</b> إكسسوارات إيطالية، ربر EPDM، سيليكون GP / WACKER ألماني أصلي.
          </div>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            ثانياً: جدول الكميات والأسعار (BOQ)
          </div>
          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;" border="1" bordercolor="#ddd">
            <thead style="background:#1F4E79; color:#fff;">
              <tr>
                <th style="padding:6px;">البند</th>
                <th style="padding:6px;">الوصف والمقاسات</th>
                <th style="padding:6px; width:50px;">العدد</th>
                <th style="padding:6px; width:80px;">المساحة</th>
                <th style="padding:6px; width:50px;">الوحدة</th>
                <th style="padding:6px; width:80px;">السعر (SAR)</th>
                <th style="padding:6px; width:95px;">الإجمالي (SAR)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width:48%; margin-right:auto; margin-left:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">إجمالي البنود قبل الضريبة:</td>
              <td style="text-align:right; padding:4px 8px;">${subtotalFmt} ريال</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">ضريبة القيمة المضافة (15%):</td>
              <td style="text-align:right; padding:4px 8px;">${vatFmt} ريال</td>
            </tr>
            <tr style="background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;">
              <td style="padding:5px 8px;">الإجمالي شامل الضريبة:</td>
              <td style="text-align:right; padding:5px 8px;">${grandTotalFmt} ريال</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            ثالثاً: الشروط التجارية المعتمدة
          </div>
          <ul style="font-size:11px; line-height:1.6; margin:0; padding-right:18px;">
            ${(function() {
              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);
              if (terms.length > 0) {
                return terms.map(t => `<li><b>${t.titleAr}:</b> ${t.textAr}</li>`).join('');
              }
              return `
                <li><b>صلاحية العرض:</b> ${q.validityDays || 3} أيام تقويمية من تاريخ صدور العرض.</li>
                <li><b>التوريد والتركيب:</b> ${q.deliveryDays || 30} يوماً للتوريد بالمصنع، و${q.installDays || 10} أيام للتركيب بالموقع.</li>
                <li><b>شروط الدفع:</b> 50% عند توقيع العقد، و45% عند جاهزية المواد بالمصنع، و5% عند البدء بالتركيب.</li>
                <li>جميع المقاسات تخضع للرفع النهائي بالموقع والاعتماد قبل بدء قص الألمنيوم.</li>
                <li>علامة (*) تعني تطبيق الحد الأدنى بقيمة 650 ريال للوحدة التي تقل مساحتها عن 1 م².</li>
                <li><b>الحساب البنكي المعتمد حصراً:</b> مصرف الراجحي - IBAN: <b>SA4080000510608010602103</b> باسم شركة بريكسن.</li>
              `;
            })()}
          </ul>

          <div class="footer-sign-container" style="page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
              <div style="font-size:12px;">شاكرين لكم إتاحة الفرصة لتقديم عرضنا، ونتطلع للعمل معكم.</div>
              <div style="font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;">شركة بريكسن ذات مسؤولية محدودة</div>
              <div style="font-size:11px; color:#666;">سجل تجاري: 7054850701 | الرياض - المملكة العربية السعودية</div>
            </div>
            <div style="text-align:left;">
              <div style="border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:11px; font-weight:bold; background:#f9fbfe; border-radius:4px; display:inline-block; margin-bottom:6px;">
                شركة بريكسن ذ.م.م<br>
                س.ت: 7054850701<br>
                عرض سعر معتمد
              </div>
            </div>
          </div>
        </div>
      `;
    },

    buildEnglishQuotationHTML: function(q) {
      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});

      let rowsHtml = '';
      q.items.forEach((itm, idx) => {
        const star = itm.isMinimumApplied ? '*' : '';
        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;
        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
        const descEn = itm.descriptionEn || (`Supply and installation of ${itm.category || 'aluminum'} architectural unit.`);

        rowsHtml += `<tr>
          <td style="text-align:center; font-weight:bold;">${itm.itemCode || (idx+1)}</td>
          <td style="text-align:left;">${descEn}</td>
          <td style="text-align:center;">${itm.count}</td>
          <td style="text-align:center;">${areaDisp} m²</td>
          <td style="text-align:center;">m²</td>
          <td style="text-align:right;">${rateDisp}</td>
          <td style="text-align:right; font-weight:bold;">${totalDisp}</td>
        </tr>`;
      });

      return `
        <div class="a4-sheet" dir="ltr">
          <div style="border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:22px; font-weight:800; color:#111; letter-spacing:1px;">BRI<span style="color:#E30613;">X</span>EN <span style="font-size:14px;">LLC</span></div>
              <div style="font-size:11px; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>
              <div style="font-size:11px; color:#555;">www.brixenco.com | info@brixenco.com</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:18px; font-weight:bold; color:#1F4E79;">Commercial Quotation</div>
              <div style="font-size:11px; color:#666;">Ref: ${q.referenceNo}</div>
            </div>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:12px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;">Ref. No.:</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.referenceNo}</td>
              <td style="background:#f8fafc; font-weight:bold; width:16%; padding:5px 8px; color:#1F4E79;">Date:</td>
              <td style="padding:5px 8px;">${q.date}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">To (Client):</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.customerName}</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">Project:</td>
              <td style="padding:5px 8px;">${q.projectName}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">Subject:</td>
              <td style="padding:5px 8px;">Aluminum Doors, Windows, Glazing & Cladding Works</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">Currency:</td>
              <td style="padding:5px 8px;">Saudi Riyal (SAR)</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">Basis:</td>
              <td style="padding:5px 8px;">Architectural drawings, project BOQ, and site measurements</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">Pricing Scope:</td>
              <td style="padding:5px 8px;">Supply, fabrication, transport, and site installation</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            A) TECHNICAL SPECIFICATIONS & BASIS OF DESIGN
          </div>
          <div style="font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;">
            • <b>Aluminum Profiles:</b> Saraya 105mm fixed/hinged window series (1.5mm wall thickness); Saraya 45mm hopper series (1.5mm thickness); Heavy Duty Door Series 100mm (2.0mm thickness).<br>
            • <b>Glazing Composition:</b> GL1: 24mm DGU (6mm Clear Temp + 12mm Air Space + 6mm Clear Temp). GL2: 24mm Frosted DGU for bathrooms. GL3: 10mm Clear Tempered Frameless Structural Glass for elevator facade.<br>
            • <b>Hardware & Accessories:</b> Genuine Italian mechanical hardware & multi-point locking gear, continuous EPDM weather-stripping rubber gaskets, German GP / WACKER structural silicone.
          </div>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            B) PRICE SCHEDULE (BOQ)
          </div>
          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;" border="1" bordercolor="#ddd">
            <thead style="background:#1F4E79; color:#fff;">
              <tr>
                <th style="padding:6px; width:50px;">Item</th>
                <th style="padding:6px;">Description & Opening Dimensions</th>
                <th style="padding:6px; width:50px;">Qty</th>
                <th style="padding:6px; width:85px;">Total Area</th>
                <th style="padding:6px; width:50px;">Unit</th>
                <th style="padding:6px; width:85px;">Rate (SAR)</th>
                <th style="padding:6px; width:95px;">Amount (SAR)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width:48%; margin-left:auto; margin-right:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">Total Net Price (Excl. VAT):</td>
              <td style="text-align:right; padding:4px 8px;">${subtotalFmt} SAR</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">Value Added Tax (15% VAT):</td>
              <td style="text-align:right; padding:4px 8px;">${vatFmt} SAR</td>
            </tr>
            <tr style="background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;">
              <td style="padding:5px 8px;">Grand Total (Incl. VAT):</td>
              <td style="text-align:right; padding:5px 8px;">${grandTotalFmt} SAR</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px;">
            C) COMMERCIAL TERMS & CONDITIONS
          </div>
          <ul style="font-size:11px; line-height:1.6; margin:0; padding-left:18px;">
            ${(function() {
              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);
              if (terms.length > 0) {
                return terms.map(t => {
                  const title = (t.titleEn || t.titleAr || '').replace(/[\u0600-\u06FF]/g, '').trim();
                  const body = (t.textEn || t.textAr || '').replace(/[\u0600-\u06FF]/g, '').trim();
                  return `<li>${title ? `<b>${title}:</b> ` : ''}${body}</li>`;
                }).join('');
              }
              return `
                <li><b>Offer Validity:</b> ${q.validityDays || 3} calendar days from date of quotation.</li>
                <li><b>Manufacturing & Installation:</b> ${q.deliveryDays || 30} calendar days for factory fabrication, and ${q.installDays || 10} calendar days for site installation.</li>
                <li><b>Payment Terms:</b> 50% advance upon contract signing; 45% when materials are ready at factory prior to dispatch; 5% upon start of site installation.</li>
                <li><b>Site Verification:</b> All dimensions are subject to final architectural site verification and approval prior to cutting.</li>
                <li><b>Minimum Unit Rule (*):</b> Asterisk (*) indicates application of statutory minimum price of SAR 650.00 for units &lt; 1.0 m².</li>
                <li><b>Authorized Bank Account:</b> Al-Rajhi Bank | Beneficiary: BRIXEN LLC | IBAN: <b>SA4080000510608010602103</b></li>
              `;
            })()}
          </ul>

          <div class="footer-sign-container" style="page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
              <div style="font-size:12px; color:#444;">Thank you for the opportunity to submit our proposal. We look forward to a successful cooperation.</div>
              <div style="font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;">BRIXEN LLC — Architectural Aluminum & Glazing</div>
              <div style="font-size:11px; color:#666;">Commercial Registration: 7054850701 | Riyadh, Kingdom of Saudi Arabia</div>
            </div>
            <div style="text-align:right;">
              <div style="border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:10.5px; font-weight:bold; background:#f7faff; border-radius:4px; display:inline-block; margin-bottom:6px;">
                BRIXEN LLC<br>
                C.R. 7054850701<br>
                AUTHORIZED QUOTATION
              </div>
            </div>
          </div>
        </div>
      `;
    },

    buildBilingualQuotationHTML: function(q) {
      const subtotalFmt = (q.subtotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const vatFmt = (q.vatAmount || 0).toLocaleString('en-US', {minimumFractionDigits:2});
      const grandTotalFmt = (q.grandTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});

      let rowsHtml = '';
      q.items.forEach((itm, idx) => {
        const star = itm.isMinimumApplied ? '*' : '';
        const rateDisp = (itm.unitRate || 0).toFixed(2) + star;
        const totalDisp = (itm.lineTotal || 0).toLocaleString('en-US', {minimumFractionDigits:2});
        const areaDisp = (itm.billedAreaM2 || itm.calculatedAreaM2).toFixed(3);
        const descAr = itm.descriptionAr || '';
        const descEn = itm.descriptionEn || '';

        rowsHtml += `<tr>
          <td style="text-align:center; font-weight:bold;">${itm.itemCode || (idx+1)}</td>
          <td style="text-align:right;">
            <div style="font-weight:600; color:#111;">${descAr}</div>
            <div style="font-size:10px; color:#475569; direction:ltr; text-align:left;">${descEn}</div>
          </td>
          <td style="text-align:center;">${itm.count}</td>
          <td style="text-align:center;">${areaDisp} m²</td>
          <td style="text-align:center;">م² / m²</td>
          <td style="text-align:right;">${rateDisp}</td>
          <td style="text-align:right; font-weight:bold;">${totalDisp}</td>
        </tr>`;
      });

      return `
        <div class="a4-sheet" dir="rtl">
          <div style="border-bottom:2px solid #111; padding-bottom:10px; margin-bottom:14px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <div style="font-size:22px; font-weight:800; color:#111; letter-spacing:1px;">BRI<span style="color:#E30613;">X</span>EN <span style="font-size:14px;">LLC</span></div>
              <div style="font-size:11px; color:#555;">Riyadh - Kingdom of Saudi Arabia | C.R. 7054850701 | +966 58 020 8160</div>
              <div style="font-size:11px; color:#555;">www.brixenco.com | info@brixenco.com</div>
            </div>
            <div style="text-align:left;">
              <div style="font-size:16px; font-weight:bold; color:#1F4E79;">COMMERCIAL QUOTATION / عرض سعر معتمد</div>
              <div style="font-size:11px; color:#666;">Ref: ${q.referenceNo}</div>
            </div>
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11.5px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; width:18%; padding:5px 8px; color:#1F4E79;">المرجع / Ref.:</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.referenceNo}</td>
              <td style="background:#f8fafc; font-weight:bold; width:18%; padding:5px 8px; color:#1F4E79;">التاريخ / Date:</td>
              <td style="padding:5px 8px;">${q.date}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">إلى / Client:</td>
              <td style="font-weight:bold; padding:5px 8px;">${q.customerName}</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">المشروع / Project:</td>
              <td style="padding:5px 8px;">${q.projectName}</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">الموضوع / Subject:</td>
              <td style="padding:5px 8px;">أعمال الألمنيوم والزجاج والكلادينج / Aluminum & Glazing Works</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">العملة / Currency:</td>
              <td style="padding:5px 8px;">الريال السعودي / Saudi Riyal (SAR)</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">الأساس / Basis:</td>
              <td style="padding:5px 8px;">مخططات وجداول المشروع / Project Drawings & Site Verification</td>
              <td style="background:#f8fafc; font-weight:bold; padding:5px 8px; color:#1F4E79;">التسعير / Scope:</td>
              <td style="padding:5px 8px;">التوريد والتصنيع والتركيب / Supply, Fabrication & Installation</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;">
            <span>أولاً: المواصفات الفنية المعتمدة</span>
            <span style="font-size:11px; font-weight:normal; direction:ltr;">A) TECHNICAL SPECIFICATIONS</span>
          </div>
          <div style="font-size:11px; line-height:1.6; background:#fafafa; padding:8px 12px; border:1px solid #eee; margin-bottom:12px;">
            • <b>الألمنيوم / Aluminum:</b> قطاع القلاب سرايا 45 مم للحمامات، قطاع النوافذ 105 مم، قطاع الأبواب سرايا 100 مم (Saraya 105mm, 45mm, 100mm door series).<br>
            • <b>الزجاج / Glazing:</b> GL1: 24 مم دبل شفاف مقوى (24mm Clear DGU). GL2: 24 مم دبل مثلج مقوى (24mm Frosted DGU). GL3: 10 مم زجاج مصعد فرملس.<br>
            • <b>الإكسسوارات / Hardware:</b> إكسسوارات إيطالية معتمدة، ربر EPDM، سيليكون ألماني أصلي GP / WACKER.
          </div>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;">
            <span>ثانياً: جدول الكميات والأسعار (BOQ)</span>
            <span style="font-size:11px; font-weight:normal; direction:ltr;">B) PRICE SCHEDULE</span>
          </div>
          <table style="width:100%; border-collapse:collapse; margin-bottom:14px; font-size:11px;" border="1" bordercolor="#ddd">
            <thead style="background:#1F4E79; color:#fff;">
              <tr>
                <th style="padding:6px; width:45px;">البند / Item</th>
                <th style="padding:6px;">الوصف والمقاسات / Description & Dimensions</th>
                <th style="padding:6px; width:50px;">العدد / Qty</th>
                <th style="padding:6px; width:80px;">المساحة / Area</th>
                <th style="padding:6px; width:65px;">الوحدة / Unit</th>
                <th style="padding:6px; width:80px;">السعر / Rate</th>
                <th style="padding:6px; width:95px;">الإجمالي / Total</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width:50%; margin-right:auto; margin-left:0; border-collapse:collapse; margin-bottom:14px; font-size:12px;" border="1" bordercolor="#ccc">
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">إجمالي البنود / Subtotal (Excl. VAT):</td>
              <td style="text-align:right; padding:4px 8px;">${subtotalFmt} SAR</td>
            </tr>
            <tr>
              <td style="background:#f8fafc; font-weight:bold; padding:4px 8px;">ضريبة القيمة المضافة / VAT (15%):</td>
              <td style="text-align:right; padding:4px 8px;">${vatFmt} SAR</td>
            </tr>
            <tr style="background:#eef4fa; font-size:13px; font-weight:bold; color:#1F4E79;">
              <td style="padding:5px 8px;">الإجمالي شامل الضريبة / Grand Total:</td>
              <td style="text-align:right; padding:5px 8px;">${grandTotalFmt} SAR</td>
            </tr>
          </table>

          <div style="font-size:13px; font-weight:bold; color:#1F4E79; border-bottom:1px solid #1F4E79; margin:12px 0 6px 0; padding-bottom:2px; display:flex; justify-content:space-between;">
            <span>ثالثاً: الشروط التجارية</span>
            <span style="font-size:11px; font-weight:normal; direction:ltr;">C) COMMERCIAL TERMS</span>
          </div>
          <ul style="font-size:11px; line-height:1.6; margin:0; padding-right:18px;">
            ${(function() {
              const terms = (q.selectedTerms || []).filter(t => t.isSelected !== false);
              if (terms.length > 0) {
                return terms.map(t => `
                  <li>
                    <b>${t.titleAr} / ${t.titleEn || ''}:</b> ${t.textAr}
                    ${t.textEn ? `<div style="font-size:10px; color:#475569; direction:ltr; text-align:left;">${t.textEn}</div>` : ''}
                  </li>
                `).join('');
              }
              return `
                <li><b>صلاحية العرض / Validity:</b> ${q.validityDays || 3} أيام تقويمية من تاريخ صدور العرض (3 calendar days from issuance date).</li>
                <li><b>التوريد والتركيب / Supply & Install:</b> ${q.deliveryDays || 30} يوماً للتوريد بالمصنع، و${q.installDays || 10} أيام للتركيب بالموقع.</li>
                <li><b>شروط الدفع / Payment Terms:</b> 50% دفعة مقدمة، و45% عند جاهزية المواد بالمصنع، و5% عند البدء بالتركيب.</li>
                <li><b>الحد الأدنى (*) / Minimum Charge:</b> علامة (*) تعني تطبيق الحد الأدنى 650 ريال للوحدة التي تقل عن 1 م² (Min. SAR 650 for < 1.0 m²).</li>
                <li><b>الحساب البنكي / Bank Details:</b> مصرف الراجحي (Al-Rajhi Bank) - IBAN: <b>SA4080000510608010602103</b> باسم شركة بريكسن.</li>
              `;
            })()}
          </ul>

          <div class="footer-sign-container" style="page-break-inside:avoid; break-inside:avoid; margin-top:24px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:flex-end;">
            <div>
              <div style="font-size:12px;">شاكرين لكم حسن تعاونكم / Thank you for your business.</div>
              <div style="font-size:13px; font-weight:bold; color:#1F4E79; margin-top:4px;">شركة بريكسن ذات مسؤولية محدودة / BRIXEN LLC</div>
              <div style="font-size:11px; color:#666;">C.R. 7054850701 | س.ت 7054850701 - الرياض</div>
            </div>
            <div style="text-align:left;">
              <div style="border:2px solid #1F4E79; color:#1F4E79; padding:6px 14px; text-align:center; font-size:11px; font-weight:bold; background:#f9fbfe; border-radius:4px; display:inline-block; margin-bottom:6px;">
                BRIXEN LLC<br>
                C.R. 7054850701<br>
                عرض سعر معتمد
              </div>
            </div>
          </div>
        </div>
      `;
    },

    previewHistoricalQuote: function(q) {
      State.activeQuote.referenceNo = q.ReferenceNo;
      State.activeQuote.customerName = q.CustomerName;
      State.activeQuote.projectName = q.ProjectName;
      State.activeQuote.date = q.Date;
      State.activeQuote.subtotal = q.SubtotalExclVAT;
      State.activeQuote.vatAmount = q.VATAmount;
      State.activeQuote.grandTotal = q.GrandTotal;
      State.activeQuote.language = q.Language || 'AR';
      this.openLivePreviewModal();
    },

    showToast: function(message, type) {
      type = type || 'info';
      const container = document.getElementById('toastContainer');
      if (!container) return;

      const toast = document.createElement('div');
      toast.className = `toast toast-${type}`;
      toast.textContent = message;
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
      }, 4000);
    }
  };

  // Run on page load
  window.addEventListener('DOMContentLoaded', () => {
    UI.init();
  });

})();
