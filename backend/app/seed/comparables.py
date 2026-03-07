"""Dallas comparable sales seed data.

Approximately 50 residential comparable sales spread across major Dallas
neighborhoods. Sale dates range from 2025 to early 2026. All coordinates
are realistic lat/lng pairs within the respective neighborhoods.
price_per_sf is pre-calculated as round(sale_price / sf, 2).
"""

DALLAS_COMPARABLES = [
    # --- Oak Cliff (south of Trinity River) ---
    {"address": "710 N Edgefield Ave", "neighborhood": "Oak Cliff", "lat": 32.7485, "lng": -96.8305, "sale_price": 285000, "sale_date": "2025-03-12", "sf": 1420, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1952, "lot_sf": 5800, "price_per_sf": round(285000 / 1420, 2)},
    {"address": "423 S Windomere Ave", "neighborhood": "Oak Cliff", "lat": 32.7438, "lng": -96.8272, "sale_price": 310000, "sale_date": "2025-05-20", "sf": 1580, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1948, "lot_sf": 6200, "price_per_sf": round(310000 / 1580, 2)},
    {"address": "1318 Elmwood Blvd", "neighborhood": "Oak Cliff", "lat": 32.7412, "lng": -96.8351, "sale_price": 265000, "sale_date": "2025-07-08", "sf": 1350, "bedrooms": 2, "bathrooms": 1.5, "year_built": 1955, "lot_sf": 5400, "price_per_sf": round(265000 / 1350, 2)},
    {"address": "2015 W 10th St", "neighborhood": "Oak Cliff", "lat": 32.7460, "lng": -96.8390, "sale_price": 340000, "sale_date": "2025-09-15", "sf": 1720, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2021, "lot_sf": 4800, "price_per_sf": round(340000 / 1720, 2)},
    {"address": "938 N Marlborough Ave", "neighborhood": "Oak Cliff", "lat": 32.7502, "lng": -96.8260, "sale_price": 252000, "sale_date": "2025-11-03", "sf": 1280, "bedrooms": 2, "bathrooms": 1.5, "year_built": 1960, "lot_sf": 5100, "price_per_sf": round(252000 / 1280, 2)},
    {"address": "1601 Stevens Forest Dr", "neighborhood": "Oak Cliff", "lat": 32.7375, "lng": -96.8415, "sale_price": 298000, "sale_date": "2026-01-22", "sf": 1500, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1958, "lot_sf": 6500, "price_per_sf": round(298000 / 1500, 2)},

    # --- Bishop Arts District ---
    {"address": "307 N Bishop Ave", "neighborhood": "Bishop Arts", "lat": 32.7470, "lng": -96.8270, "sale_price": 395000, "sale_date": "2025-02-18", "sf": 1650, "bedrooms": 3, "bathrooms": 2.0, "year_built": 2019, "lot_sf": 4200, "price_per_sf": round(395000 / 1650, 2)},
    {"address": "512 W 7th St", "neighborhood": "Bishop Arts", "lat": 32.7490, "lng": -96.8295, "sale_price": 425000, "sale_date": "2025-04-05", "sf": 1800, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2022, "lot_sf": 4000, "price_per_sf": round(425000 / 1800, 2)},
    {"address": "618 Melba St", "neighborhood": "Bishop Arts", "lat": 32.7455, "lng": -96.8248, "sale_price": 370000, "sale_date": "2025-06-10", "sf": 1540, "bedrooms": 3, "bathrooms": 2.0, "year_built": 2018, "lot_sf": 4500, "price_per_sf": round(370000 / 1540, 2)},
    {"address": "215 N Tyler St", "neighborhood": "Bishop Arts", "lat": 32.7478, "lng": -96.8310, "sale_price": 445000, "sale_date": "2025-08-28", "sf": 1900, "bedrooms": 4, "bathrooms": 2.5, "year_built": 2023, "lot_sf": 4100, "price_per_sf": round(445000 / 1900, 2)},
    {"address": "820 W Davis St", "neighborhood": "Bishop Arts", "lat": 32.7465, "lng": -96.8335, "sale_price": 358000, "sale_date": "2025-12-14", "sf": 1480, "bedrooms": 2, "bathrooms": 2.0, "year_built": 2020, "lot_sf": 4300, "price_per_sf": round(358000 / 1480, 2)},

    # --- Deep Ellum ---
    {"address": "2814 Canton St", "neighborhood": "Deep Ellum", "lat": 32.7830, "lng": -96.7830, "sale_price": 485000, "sale_date": "2025-01-25", "sf": 1750, "bedrooms": 2, "bathrooms": 2.5, "year_built": 2023, "lot_sf": 4000, "price_per_sf": round(485000 / 1750, 2)},
    {"address": "2920 Commerce St", "neighborhood": "Deep Ellum", "lat": 32.7818, "lng": -96.7810, "sale_price": 520000, "sale_date": "2025-03-30", "sf": 1850, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2024, "lot_sf": 4200, "price_per_sf": round(520000 / 1850, 2)},
    {"address": "3015 Main St", "neighborhood": "Deep Ellum", "lat": 32.7825, "lng": -96.7795, "sale_price": 465000, "sale_date": "2025-06-18", "sf": 1680, "bedrooms": 2, "bathrooms": 2.0, "year_built": 2022, "lot_sf": 4100, "price_per_sf": round(465000 / 1680, 2)},
    {"address": "2710 Elm St", "neighborhood": "Deep Ellum", "lat": 32.7840, "lng": -96.7850, "sale_price": 498000, "sale_date": "2025-09-22", "sf": 1790, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2024, "lot_sf": 4050, "price_per_sf": round(498000 / 1790, 2)},
    {"address": "3102 Swiss Ave", "neighborhood": "Deep Ellum", "lat": 32.7860, "lng": -96.7775, "sale_price": 540000, "sale_date": "2025-11-30", "sf": 1920, "bedrooms": 3, "bathrooms": 3.0, "year_built": 2024, "lot_sf": 4500, "price_per_sf": round(540000 / 1920, 2)},
    {"address": "2605 Pacific Ave", "neighborhood": "Deep Ellum", "lat": 32.7850, "lng": -96.7870, "sale_price": 455000, "sale_date": "2026-02-10", "sf": 1620, "bedrooms": 2, "bathrooms": 2.0, "year_built": 2021, "lot_sf": 4000, "price_per_sf": round(455000 / 1620, 2)},

    # --- Lakewood ---
    {"address": "6430 Prospect Ave", "neighborhood": "Lakewood", "lat": 32.8120, "lng": -96.7400, "sale_price": 625000, "sale_date": "2025-02-05", "sf": 2200, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1938, "lot_sf": 8500, "price_per_sf": round(625000 / 2200, 2)},
    {"address": "6815 La Vista Dr", "neighborhood": "Lakewood", "lat": 32.8155, "lng": -96.7365, "sale_price": 695000, "sale_date": "2025-04-18", "sf": 2450, "bedrooms": 4, "bathrooms": 3.5, "year_built": 1942, "lot_sf": 9200, "price_per_sf": round(695000 / 2450, 2)},
    {"address": "7012 Lakewood Blvd", "neighborhood": "Lakewood", "lat": 32.8180, "lng": -96.7340, "sale_price": 580000, "sale_date": "2025-06-25", "sf": 2050, "bedrooms": 3, "bathrooms": 2.5, "year_built": 1950, "lot_sf": 7800, "price_per_sf": round(580000 / 2050, 2)},
    {"address": "6218 Velasco Ave", "neighborhood": "Lakewood", "lat": 32.8100, "lng": -96.7420, "sale_price": 550000, "sale_date": "2025-08-12", "sf": 1950, "bedrooms": 3, "bathrooms": 2.5, "year_built": 1955, "lot_sf": 7500, "price_per_sf": round(550000 / 1950, 2)},
    {"address": "7205 Tokalon Dr", "neighborhood": "Lakewood", "lat": 32.8198, "lng": -96.7310, "sale_price": 745000, "sale_date": "2025-10-30", "sf": 2680, "bedrooms": 5, "bathrooms": 3.5, "year_built": 1935, "lot_sf": 10200, "price_per_sf": round(745000 / 2680, 2)},
    {"address": "6920 Kenwood Ave", "neighborhood": "Lakewood", "lat": 32.8140, "lng": -96.7380, "sale_price": 610000, "sale_date": "2026-01-08", "sf": 2150, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1945, "lot_sf": 8000, "price_per_sf": round(610000 / 2150, 2)},

    # --- M Streets ---
    {"address": "5310 Miller Ave", "neighborhood": "M Streets", "lat": 32.8260, "lng": -96.7620, "sale_price": 575000, "sale_date": "2025-01-15", "sf": 1980, "bedrooms": 3, "bathrooms": 2.5, "year_built": 1940, "lot_sf": 7000, "price_per_sf": round(575000 / 1980, 2)},
    {"address": "5502 Morningside Ave", "neighborhood": "M Streets", "lat": 32.8275, "lng": -96.7595, "sale_price": 620000, "sale_date": "2025-03-22", "sf": 2100, "bedrooms": 4, "bathrooms": 2.5, "year_built": 1938, "lot_sf": 7200, "price_per_sf": round(620000 / 2100, 2)},
    {"address": "5718 Mercedes Ave", "neighborhood": "M Streets", "lat": 32.8290, "lng": -96.7570, "sale_price": 540000, "sale_date": "2025-05-10", "sf": 1850, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1945, "lot_sf": 6800, "price_per_sf": round(540000 / 1850, 2)},
    {"address": "5425 Monticello Ave", "neighborhood": "M Streets", "lat": 32.8268, "lng": -96.7605, "sale_price": 598000, "sale_date": "2025-07-18", "sf": 2050, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1942, "lot_sf": 7400, "price_per_sf": round(598000 / 2050, 2)},
    {"address": "5830 McCommas Blvd", "neighborhood": "M Streets", "lat": 32.8302, "lng": -96.7550, "sale_price": 510000, "sale_date": "2025-09-25", "sf": 1780, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1950, "lot_sf": 6500, "price_per_sf": round(510000 / 1780, 2)},
    {"address": "5615 Marquita Ave", "neighborhood": "M Streets", "lat": 32.8282, "lng": -96.7582, "sale_price": 565000, "sale_date": "2025-12-05", "sf": 1920, "bedrooms": 3, "bathrooms": 2.5, "year_built": 1948, "lot_sf": 7100, "price_per_sf": round(565000 / 1920, 2)},
    {"address": "5205 Merrimac Ave", "neighborhood": "M Streets", "lat": 32.8248, "lng": -96.7638, "sale_price": 635000, "sale_date": "2026-02-18", "sf": 2250, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1936, "lot_sf": 7600, "price_per_sf": round(635000 / 2250, 2)},

    # --- Park Cities (Highland Park / University Park) ---
    {"address": "3420 Princeton Ave", "neighborhood": "Park Cities", "lat": 32.8380, "lng": -96.7920, "sale_price": 795000, "sale_date": "2025-02-28", "sf": 2800, "bedrooms": 4, "bathrooms": 3.5, "year_built": 1935, "lot_sf": 10500, "price_per_sf": round(795000 / 2800, 2)},
    {"address": "4215 Shenandoah Ave", "neighborhood": "Park Cities", "lat": 32.8350, "lng": -96.7965, "sale_price": 780000, "sale_date": "2025-05-15", "sf": 2650, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1940, "lot_sf": 9800, "price_per_sf": round(780000 / 2650, 2)},
    {"address": "3612 Haynie Ave", "neighborhood": "Park Cities", "lat": 32.8395, "lng": -96.7895, "sale_price": 750000, "sale_date": "2025-07-22", "sf": 2500, "bedrooms": 4, "bathrooms": 3.0, "year_built": 1945, "lot_sf": 9500, "price_per_sf": round(750000 / 2500, 2)},
    {"address": "4018 Caruth Blvd", "neighborhood": "Park Cities", "lat": 32.8365, "lng": -96.7940, "sale_price": 800000, "sale_date": "2025-10-10", "sf": 2900, "bedrooms": 5, "bathrooms": 3.5, "year_built": 1932, "lot_sf": 11000, "price_per_sf": round(800000 / 2900, 2)},
    {"address": "3805 Stanford Ave", "neighborhood": "Park Cities", "lat": 32.8388, "lng": -96.7908, "sale_price": 765000, "sale_date": "2026-01-14", "sf": 2700, "bedrooms": 4, "bathrooms": 3.5, "year_built": 1938, "lot_sf": 10200, "price_per_sf": round(765000 / 2700, 2)},

    # --- Oak Lawn ---
    {"address": "3918 Hawthorne Ave", "neighborhood": "Oak Lawn", "lat": 32.8105, "lng": -96.8110, "sale_price": 475000, "sale_date": "2025-03-08", "sf": 1650, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1955, "lot_sf": 5200, "price_per_sf": round(475000 / 1650, 2)},
    {"address": "4120 Hall St", "neighborhood": "Oak Lawn", "lat": 32.8125, "lng": -96.8085, "sale_price": 525000, "sale_date": "2025-05-25", "sf": 1820, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2020, "lot_sf": 4800, "price_per_sf": round(525000 / 1820, 2)},
    {"address": "4305 Bowser Ave", "neighborhood": "Oak Lawn", "lat": 32.8140, "lng": -96.8065, "sale_price": 498000, "sale_date": "2025-08-02", "sf": 1720, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1960, "lot_sf": 5000, "price_per_sf": round(498000 / 1720, 2)},
    {"address": "3710 Rawlins St", "neighborhood": "Oak Lawn", "lat": 32.8090, "lng": -96.8130, "sale_price": 455000, "sale_date": "2025-10-15", "sf": 1580, "bedrooms": 2, "bathrooms": 2.0, "year_built": 1958, "lot_sf": 4600, "price_per_sf": round(455000 / 1580, 2)},
    {"address": "4510 Travis St", "neighborhood": "Oak Lawn", "lat": 32.8158, "lng": -96.8040, "sale_price": 545000, "sale_date": "2025-12-20", "sf": 1900, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2022, "lot_sf": 5100, "price_per_sf": round(545000 / 1900, 2)},
    {"address": "3825 Lemmon Ave", "neighborhood": "Oak Lawn", "lat": 32.8098, "lng": -96.8120, "sale_price": 490000, "sale_date": "2026-02-25", "sf": 1680, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1965, "lot_sf": 5300, "price_per_sf": round(490000 / 1680, 2)},

    # --- East Dallas ---
    {"address": "2415 N Fitzhugh Ave", "neighborhood": "East Dallas", "lat": 32.8010, "lng": -96.7720, "sale_price": 385000, "sale_date": "2025-01-30", "sf": 1550, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1952, "lot_sf": 6000, "price_per_sf": round(385000 / 1550, 2)},
    {"address": "2718 San Marcus Ave", "neighborhood": "East Dallas", "lat": 32.8035, "lng": -96.7695, "sale_price": 420000, "sale_date": "2025-04-12", "sf": 1700, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2019, "lot_sf": 5500, "price_per_sf": round(420000 / 1700, 2)},
    {"address": "3010 Bryan St", "neighborhood": "East Dallas", "lat": 32.7955, "lng": -96.7750, "sale_price": 365000, "sale_date": "2025-06-28", "sf": 1480, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1956, "lot_sf": 5800, "price_per_sf": round(365000 / 1480, 2)},
    {"address": "2520 Abrams Rd", "neighborhood": "East Dallas", "lat": 32.8025, "lng": -96.7530, "sale_price": 440000, "sale_date": "2025-08-18", "sf": 1820, "bedrooms": 4, "bathrooms": 2.5, "year_built": 2020, "lot_sf": 5200, "price_per_sf": round(440000 / 1820, 2)},
    {"address": "3215 Worth St", "neighborhood": "East Dallas", "lat": 32.7940, "lng": -96.7680, "sale_price": 350000, "sale_date": "2025-10-05", "sf": 1400, "bedrooms": 2, "bathrooms": 2.0, "year_built": 1960, "lot_sf": 5600, "price_per_sf": round(350000 / 1400, 2)},
    {"address": "2825 Gaston Ave", "neighborhood": "East Dallas", "lat": 32.8000, "lng": -96.7710, "sale_price": 398000, "sale_date": "2025-12-22", "sf": 1600, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1954, "lot_sf": 6200, "price_per_sf": round(398000 / 1600, 2)},
    {"address": "2610 Live Oak St", "neighborhood": "East Dallas", "lat": 32.7985, "lng": -96.7735, "sale_price": 415000, "sale_date": "2026-02-08", "sf": 1680, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2018, "lot_sf": 5400, "price_per_sf": round(415000 / 1680, 2)},
]
