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
