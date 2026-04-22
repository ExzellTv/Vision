/**
 * Shared sample builders directory.
 * Used by Browse (homeowner discovery) and Chat (profile lookup from conversation builder_id).
 */
export const BUILDERS = [
  {
    id: 1,
    name: "Highland Custom Homes",
    company: "Highland Development Group",
    avatar: null,
    initials: "HC",
    specialty: "Luxury Residential",
    location: "Highland Park, TX",
    distance: "2.3 mi",
    rating: 4.9,
    reviews: 127,
    projectsCompleted: 84,
    verified: true,
    description: "Award-winning custom home builder specializing in luxury residences throughout the Park Cities and Preston Hollow.",
    tags: ["Luxury", "Custom Homes", "Modern"],
  },
  {
    id: 2,
    name: "Dallas Urban Builders",
    company: "DUB Construction LLC",
    avatar: null,
    initials: "DU",
    specialty: "Urban Infill",
    location: "Uptown, TX",
    distance: "4.1 mi",
    rating: 4.7,
    reviews: 89,
    projectsCompleted: 156,
    verified: true,
    description: "Experts in urban infill development and modern townhome construction in Dallas's most desirable neighborhoods.",
    tags: ["Urban", "Townhomes", "Infill"],
  },
  {
    id: 3,
    name: "Prestige Home Builders",
    company: "Prestige Residential Inc.",
    avatar: null,
    initials: "PH",
    specialty: "Estate Homes",
    location: "University Park, TX",
    distance: "3.7 mi",
    rating: 5,
    reviews: 42,
    projectsCompleted: 31,
    verified: true,
    description: "Boutique builder focused on estate-quality homes with exceptional craftsmanship and attention to detail.",
    tags: ["Estate", "Premium", "Craftsmanship"],
  },
  {
    id: 4,
    name: "Metro Construction Co",
    company: "Metro Builders Group",
    avatar: null,
    initials: "MC",
    specialty: "Production Homes",
    location: "Frisco, TX",
    distance: "18.5 mi",
    rating: 4.5,
    reviews: 312,
    projectsCompleted: 420,
    verified: true,
    description: "Large-scale production builder delivering quality homes across the DFW metroplex with competitive pricing.",
    tags: ["Production", "Affordable", "New Communities"],
  },
  {
    id: 5,
    name: "Artisan Home Studios",
    company: "Artisan Design Build",
    avatar: null,
    initials: "AH",
    specialty: "Modern Architecture",
    location: "Oak Lawn, TX",
    distance: "5.2 mi",
    rating: 4.8,
    reviews: 67,
    projectsCompleted: 48,
    verified: true,
    description: "Architectural design-build firm creating stunning modern homes with sustainable features and innovative design.",
    tags: ["Modern", "Sustainable", "Design-Build"],
  },
  {
    id: 6,
    name: "Heritage Homes Texas",
    company: "Heritage Construction Partners",
    avatar: null,
    initials: "HH",
    specialty: "Traditional & Transitional",
    location: "Lakewood, TX",
    distance: "6.8 mi",
    rating: 4.6,
    reviews: 94,
    projectsCompleted: 112,
    verified: false,
    description: "Family-owned builder specializing in traditional and transitional style homes with timeless appeal.",
    tags: ["Traditional", "Family-Owned", "Transitional"],
  },
];

export const SPECIALTIES = [
  "All Specialties", "Luxury Residential", "Urban Infill", "Estate Homes",
  "Production Homes", "Modern Architecture", "Traditional & Transitional",
];

/** Lookup by id (string or number) or by name (case-insensitive). */
export function findBuilder({ id, name } = {}) {
  if (id != null) {
    const byId = BUILDERS.find((b) => String(b.id) === String(id));
    if (byId) return byId;
  }
  if (name) {
    const n = name.trim().toLowerCase();
    return BUILDERS.find((b) => b.name.toLowerCase() === n);
  }
  return null;
}
