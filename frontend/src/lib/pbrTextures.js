/**
 * PBR texture sets — sourced from Polyhaven (CC0, https://polyhaven.com).
 * Loads diffuse/normal/roughness/AO maps from their CDN (CORS-enabled).
 *
 * Two APIs:
 *   - TEXTURE_SETS             — config map of texture set → URLs + repeat
 *   - loadTextureSetAsync(key) — vanilla Three.js loader for buildHouseGeometry
 *   - useTextureSet(key)        — React hook (via drei useTexture) for JSX materials
 *
 * Graceful fallback: if any map fails to load the caller keeps the plain color
 * material — textures are purely additive.
 */
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

const POLYHAVEN_TEX = "https://dl.polyhaven.org/file/ph-assets/Textures/jpg";

/**
 * Build the four map URLs for a Polyhaven texture name at the given resolution.
 * Use 2k for surfaces that fill a lot of screen (exterior walls, ground close-ups);
 * 1k is plenty for floors, slab, and roof tiles which are smaller on screen.
 */
function polyhaven(name, res = "1k") {
  const base = `${POLYHAVEN_TEX}/${res}/${name}`;
  return {
    map:          `${base}/${name}_diff_${res}.jpg`,
    normalMap:    `${base}/${name}_nor_gl_${res}.jpg`,
    roughnessMap: `${base}/${name}_rough_${res}.jpg`,
    aoMap:        `${base}/${name}_ao_${res}.jpg`,
  };
}

/**
 * Texture set config. `repeat` is the UV tiling in (u, v) — bigger numbers =
 * more tiling = smaller visible texture. Tuned for a ~40ft house.
 */
export const TEXTURE_SETS = {
  // Exterior wall fills most of the screen on the 3D preview — bump to 2k for crisp close-ups.
  exteriorWall: { ...polyhaven("painted_plaster_wall", "2k"), repeat: [4, 4] },
  roof:         { ...polyhaven("roof_tiles_14", "1k"),         repeat: [6, 6] },
  floor:        { ...polyhaven("wood_planks_grey", "1k"),      repeat: [4, 4] },
  slab:         { ...polyhaven("concrete_floor_worn_001", "1k"), repeat: [4, 4] },
  // Grass is large and seen at oblique angles — 2k prevents obvious blur near the foundation.
  grass:        { ...polyhaven("sparse_grass", "2k"),          repeat: [10, 10] },
};

const _loader = new THREE.TextureLoader();
_loader.crossOrigin = "anonymous";
const _cache = new Map();

function loadTextureAsync(url) {
  if (_cache.has(url)) return _cache.get(url);
  const promise = new Promise((resolve, reject) => {
    _loader.load(url, resolve, undefined, reject);
  });
  _cache.set(url, promise);
  return promise;
}

/**
 * Configure a texture: sRGB for albedo, linear for the rest, repeat wrap.
 * mapType is "map" | "normalMap" | "roughnessMap" | "aoMap".
 */
function configureTexture(tex, mapType, repeat) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  tex.colorSpace = mapType === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Load a full PBR texture set asynchronously. Returns an object with the four
 * maps (or null values for any that failed). Safe to `await` at init time —
 * never rejects.
 */
export async function loadTextureSetAsync(key) {
  const cfg = TEXTURE_SETS[key];
  if (!cfg) {
    console.warn(`[Vision] Unknown texture set: ${key}`);
    return null;
  }
  const { repeat, ...urls } = cfg;

  const entries = await Promise.all(
    Object.entries(urls).map(async ([mapType, url]) => {
      try {
        const tex = await loadTextureAsync(url);
        configureTexture(tex, mapType, repeat);
        return [mapType, tex];
      } catch (err) {
        if (import.meta.env.DEV) console.warn(`[Vision] Texture failed: ${url}`, err);
        return [mapType, null];
      }
    })
  );
  return Object.fromEntries(entries);
}

/**
 * Apply a loaded texture set to a MeshStandardMaterial / MeshPhysicalMaterial.
 * Mutates in place and calls needsUpdate.
 */
export function applyTexturesToMaterial(material, textures) {
  if (!material || !textures) return;
  if (textures.map) material.map = textures.map;
  if (textures.normalMap) material.normalMap = textures.normalMap;
  if (textures.roughnessMap) material.roughnessMap = textures.roughnessMap;
  if (textures.aoMap) material.aoMap = textures.aoMap;
  // When textures are applied, let the texture drive the color — keep a slight
  // tint via existing material.color.
  material.needsUpdate = true;
}

/**
 * React hook — loads a texture set via drei's useTexture and returns an object
 * suitable for spreading onto a <meshStandardMaterial> JSX element.
 *
 * Usage:
 *   const props = useTextureSet("exteriorWall");
 *   <meshStandardMaterial {...props} color="#e8e2da" />
 */
export function useTextureSet(key) {
  const cfg = TEXTURE_SETS[key] ?? TEXTURE_SETS.exteriorWall;
  const { repeat, ...urls } = cfg;
  // drei's useTexture wraps Three's TextureLoader with Suspense support.
  // Called unconditionally to satisfy Rules of Hooks — every TEXTURE_SETS
  // entry has the same shape so the call is stable across renders.
  const textures = useTexture(urls);

  // Configure each loaded texture (repeat, colorspace)
  Object.entries(textures).forEach(([mapType, tex]) => {
    if (tex) configureTexture(tex, mapType, repeat);
  });

  return TEXTURE_SETS[key] ? textures : {};
}
