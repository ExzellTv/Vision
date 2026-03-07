"""AISC W-shape section properties for seed data.

Seven common W-shape sections used in residential structural design.
All values sourced from the AISC Steel Construction Manual, 16th Edition.
Material: ASTM A992 (Fy = 50 ksi, E = 29,000 ksi).
"""

AISC_SECTIONS = [
    {"designation": "W14x22", "depth_in": 13.7, "bf_in": 5.00, "area_in2": 6.49, "ix_in4": 199, "sx_in3": 29.0, "zx_in3": 33.2, "weight_plf": 22, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W14x30", "depth_in": 13.8, "bf_in": 6.73, "area_in2": 8.85, "ix_in4": 291, "sx_in3": 42.0, "zx_in3": 47.3, "weight_plf": 30, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W14x90", "depth_in": 14.0, "bf_in": 14.52, "area_in2": 26.5, "ix_in4": 999, "sx_in3": 143, "zx_in3": 157, "weight_plf": 90, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W16x36", "depth_in": 15.9, "bf_in": 6.99, "area_in2": 10.6, "ix_in4": 448, "sx_in3": 56.5, "zx_in3": 64.0, "weight_plf": 36, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W18x50", "depth_in": 18.0, "bf_in": 7.50, "area_in2": 14.7, "ix_in4": 800, "sx_in3": 88.9, "zx_in3": 101, "weight_plf": 50, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W21x62", "depth_in": 21.0, "bf_in": 8.24, "area_in2": 18.3, "ix_in4": 1330, "sx_in3": 127, "zx_in3": 144, "weight_plf": 62, "fy_ksi": 50, "e_ksi": 29000},
    {"designation": "W24x84", "depth_in": 24.1, "bf_in": 9.02, "area_in2": 24.7, "ix_in4": 2370, "sx_in3": 196, "zx_in3": 224, "weight_plf": 84, "fy_ksi": 50, "e_ksi": 29000},
]
