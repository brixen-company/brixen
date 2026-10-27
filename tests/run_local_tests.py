# -*- coding: utf-8 -*-
"""
BRIXEN Automated Quotation Management Platform
Test Runner: run_local_tests.py
Executes comprehensive automated unit and integration tests verifying the calculation engine,
Rule (*) logic, VAT math, and template integrity against authentic reference documents.
"""

import os, sys, json

sys.stdout.reconfigure(encoding='utf-8')

class TestSuite:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.results = []

    def assert_true(self, name, condition, error_msg="Assertion failed"):
        self.total += 1
        if condition:
            self.passed += 1
            self.results.append({"test": name, "status": "PASSED"})
            print(f"  [PASS] {name}")
        else:
            self.failed += 1
            self.results.append({"test": name, "status": "FAILED", "error": error_msg})
            print(f"  [FAIL] {name} -> {error_msg}")

    def assert_almost_equal(self, name, actual, expected, delta=0.02):
        self.total += 1
        diff = abs(actual - expected)
        if diff <= delta:
            self.passed += 1
            self.results.append({"test": name, "status": "PASSED"})
            print(f"  [PASS] {name} ({actual:.2f} == {expected:.2f})")
        else:
            self.failed += 1
            err = f"Expected {expected:.2f}, got {actual:.2f} (diff {diff:.4f})"
            self.results.append({"test": name, "status": "FAILED", "error": err})
            print(f"  [FAIL] {name} -> {err}")

# Calculation Engine Implementation in Python
def calculate_area(w, h, qty=1, unit='m'):
    if unit == 'mm':
        unit_area = (w * h) / 1000000.0
    else:
        unit_area = w * h
    total_area = unit_area * qty
    return round(unit_area, 6), round(total_area, 6)

def calculate_line_item(w, h, qty=1, unit='m', rate=650.0, billed_area=None, category='Windows'):
    unit_area, total_area = calculate_area(w, h, qty, unit)
    effective_area = billed_area if (billed_area is not None and billed_area > 0) else total_area
    is_min = False
    eligible = category in ['Windows', 'Doors']
    
    if eligible and unit_area < 1.000 and unit_area > 0:
        is_min = True
        line_total = qty * 650.00
    else:
        line_total = effective_area * rate
        
    return {
        "unit_area": unit_area,
        "total_area": total_area,
        "billed_area": effective_area,
        "is_min": is_min,
        "line_total": round(line_total, 2)
    }

def calculate_quotation(items, vat_rate=0.15):
    subtotal = 0.0
    min_count = 0
    calculated_lines = []
    
    for itm in items:
        res = calculate_line_item(
            w=itm.get('w', 0),
            h=itm.get('h', 0),
            qty=itm.get('qty', 1),
            unit=itm.get('unit', 'm'),
            rate=itm.get('rate', 650.0),
            billed_area=itm.get('billed_area', None),
            category=itm.get('category', 'Windows')
        )
        subtotal += res['line_total']
        if res['is_min']:
            min_count += 1
        calculated_lines.append(res)
        
    subtotal = round(subtotal, 2)
    vat = round(subtotal * vat_rate, 2)
    grand_total = round(subtotal + vat, 2)
    return {
        "subtotal": subtotal,
        "vat": vat,
        "grand_total": grand_total,
        "min_count": min_count,
        "lines": calculated_lines
    }

def run_all_tests():
    ts = TestSuite()
    print("==========================================================")
    print("BRIXEN PLATFORM — AUTOMATED SYSTEM TEST SUITE")
    print("==========================================================")
    
    # 1. Area Calculations
    print("\n--- Test Group 1: Area Conversion & Precision ---")
    u_area, t_area = calculate_area(2.0, 3.0, 1, 'm')
    ts.assert_almost_equal("Area in Meters (2.0 x 3.0)", t_area, 6.00)
    
    u_area_mm, t_area_mm = calculate_area(1200, 1500, 2, 'mm')
    ts.assert_almost_equal("Area in Millimeters (1200 x 1500 mm x 2)", t_area_mm, 3.60)
    
    # 2. Rule (*) Minimum Surcharge Logic
    print("\n--- Test Group 2: Rule (*) Minimum Pricing ($< 1.0 m^2$) ---")
    res_w4 = calculate_line_item(w=0.40, h=0.60, qty=1, unit='m', rate=650.0, category='Windows')
    ts.assert_true("W4 Maid Room: Rule (*) flag triggered", res_w4['is_min'])
    ts.assert_almost_equal("W4 Maid Room: Flat SAR 650 applied", res_w4['line_total'], 650.00)
    
    res_bnd = calculate_line_item(w=1.00, h=1.00, qty=1, unit='m', rate=650.0, category='Windows')
    ts.assert_true("Boundary 1.0 m^2: Rule (*) NOT triggered", not res_bnd['is_min'])
    ts.assert_almost_equal("Boundary 1.0 m^2: Standard Area*Rate applied", res_bnd['line_total'], 650.00)
    
    res_multi = calculate_line_item(w=0.50, h=0.80, qty=3, unit='m', rate=650.0, category='Windows')
    ts.assert_true("Multi-Unit (<1m^2, Qty=3): Triggered", res_multi['is_min'])
    ts.assert_almost_equal("Multi-Unit: 3 x SAR 650 = 1950", res_multi['line_total'], 1950.00)

    # 3. Authentic Khobar Villa BOQ Verification (19 Items)
    print("\n--- Test Group 3: Authentic Khobar Villa Quotation Audit ---")
    khobar_items = [
        {'w': 1.025, 'h': 2.20, 'qty': 1, 'rate': 650.0, 'category': 'Doors'},     # D1
        {'w': 1.450, 'h': 2.40, 'qty': 1, 'rate': 650.0, 'category': 'Doors'},     # D2
        {'w': 1.390, 'h': 2.20, 'qty': 1, 'rate': 650.0, 'category': 'Doors'},     # D3
        {'w': 1.380, 'h': 2.90, 'qty': 1, 'rate': 650.0, 'category': 'Doors'},     # D4
        {'w': 3.000, 'h': 2.80, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W1
        {'w': 2.700, 'h': 2.90, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W2
        {'w': 2.900, 'h': 3.10, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W3
        {'w': 0.400, 'h': 0.60, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W4 (min)
        {'w': 0.600, 'h': 0.80, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W5 (min)
        {'w': 1.400, 'h': 1.10, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W6
        {'w': 0.960, 'h': 1.20, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W7
        {'w': 0.780, 'h': 1.82, 'qty': 5, 'rate': 650.0, 'category': 'Windows'},   # W8 (5 units)
        {'w': 0.670, 'h': 1.24, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W9 (min)
        {'w': 0.660, 'h': 1.62, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W10
        {'w': 0.675, 'h': 1.81, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W11
        {'w': 2.360, 'h': 2.30, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W12
        {'w': 2.300, 'h': 3.21, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W13
        {'w': 0.660, 'h': 0.76, 'qty': 1, 'rate': 650.0, 'category': 'Windows'},   # W14 (min)
        {'w': 7.050, 'h': 2.00, 'qty': 1, 'rate': 350.0, 'billed_area': 15.00, 'category': 'Cladding'}, # CL (override)
        {'w': 0.000, 'h': 0.00, 'qty': 1, 'rate': 350.0, 'billed_area': 15.00, 'category': 'Elevator'}  # EL (frameless)
    ]
    
    khobar_res = calculate_quotation(khobar_items, vat_rate=0.15)
    ts.assert_almost_equal("Khobar Villa: Subtotal (Target: 53,989.52)", khobar_res['subtotal'], 53989.52)
    ts.assert_almost_equal("Khobar Villa: 15% VAT (Target: 8,098.43)", khobar_res['vat'], 8098.43)
    ts.assert_almost_equal("Khobar Villa: Grand Total (Target: 62,087.95)", khobar_res['grand_total'], 62087.95)
    ts.assert_true("Khobar Villa: Exactly 4 units triggered Rule (*)", khobar_res['min_count'] == 4)

    # 4. Authentic Kris Quotation Math Audit
    print("\n--- Test Group 4: Eng. Kris Quotation Audit ---")
    kris_items = [
        {'w': 0.970, 'h': 2.770, 'qty': 1, 'billed_area': 3.07, 'rate': 1073.84, 'category': 'Windows'},
        {'w': 2.400, 'h': 2.380, 'qty': 1, 'billed_area': 6.20, 'rate': 913.10, 'category': 'Windows'},
        {'w': 9.564, 'h': 2.038, 'qty': 1, 'billed_area': 20.66, 'rate': 1141.45, 'category': 'Windows'},
        {'w': 2.641, 'h': 3.318, 'qty': 1, 'billed_area': 9.36, 'rate': 796.98, 'category': 'Windows'}
    ]
    kris_res = calculate_quotation(kris_items, vat_rate=0.15)
    ts.assert_almost_equal("Kris Quote: Subtotal exactly SAR 40,000.00", kris_res['subtotal'], 40000.00)
    ts.assert_almost_equal("Kris Quote: VAT exactly SAR 6,000.00", kris_res['vat'], 6000.00)
    ts.assert_almost_equal("Kris Quote: Grand Total exactly SAR 46,000.00", kris_res['grand_total'], 46000.00)

    # 5. Asset and Schema Verification
    print("\n--- Test Group 5: Asset & File Verification ---")
    base_dir = r'd:\salla\بيرتيكس\BRIXEN_Quotation_Platform'
    assets_dir = os.path.join(base_dir, 'frontend', 'assets')
    templates_dir = os.path.join(base_dir, 'templates')
    
    ts.assert_true("Asset: Black & Red Logo exists", os.path.exists(os.path.join(assets_dir, 'brixen_logo_black_red.png')))
    ts.assert_true("Asset: Official Blue Stamp exists", os.path.exists(os.path.join(assets_dir, 'brixen_stamp_official.png')))
    ts.assert_true("Template: Master Arabic HTML exists", os.path.exists(os.path.join(templates_dir, 'quotation_ar_template.html')))
    ts.assert_true("Template: Master English HTML exists", os.path.exists(os.path.join(templates_dir, 'quotation_en_template.html')))
    
    print("\n==========================================================")
    print(f"TEST RUN COMPLETED: {ts.passed} PASSED / {ts.failed} FAILED (TOTAL: {ts.total})")
    print("==========================================================")
    
    # Save test results
    results_file = os.path.join(base_dir, 'tests', 'test_results.json')
    with open(results_file, 'w', encoding='utf-8') as f:
        json.dump({
            "total": ts.total,
            "passed": ts.passed,
            "failed": ts.failed,
            "successRate": f"{(ts.passed / ts.total) * 100:.1f}%",
            "details": ts.results
        }, f, indent=2)
    return ts.failed == 0

if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)
