import * as THREE from "three";
import { useRef, useMemo, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  PerspectiveCamera,
  Sky,
  PivotControls,
  SoftShadows,
  AccumulativeShadows,
  RandomizedLight,
  BakeShadows,
} from "@react-three/drei";
import { Geometry, Base, Subtraction, Addition } from "@react-three/csg";
import { EffectComposer, SSAO, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { Suspense } from "react";
import { useTextureSet } from "../../lib/pbrTextures";
import PlanHouse, { planIsRenderable } from "./PlanHouse";

/**
 * House3D - Modern CSG-based 3D house using React Three Fiber
 * Features:
 * - Constructive Solid Geometry for realistic cutouts
 * - Proper window/door subtraction from walls
 * - PBR materials with environment mapping
 * - Multiple roof styles
 * - Interactive elements
 */

// ─── Shared Geometries ───────────────────────────────────────────────────────

const box = new THREE.BoxGeometry();
const cyl = new THREE.CylinderGeometry(1, 1, 2, 20); // For door arch

// ─── Custom Roof Geometry Creators ──────────────────────────────────────────

/**
 * Creates a gable roof geometry with proper rectangular base
 * @param {number} width - Width of the house (X axis)
 * @param {number} depth - Depth of the house (Z axis)
 * @param {number} height - Peak height of the roof
 * @param {number} overhang - Eave overhang distance
 */
function createGableRoofGeometry(width, depth, height, overhang = 0.15) {
  const w = width / 2 + overhang;
  const d = depth / 2 + overhang;
  const h = height;

  // Gable roof: ridge runs along Z axis (depth), slopes down on X sides
  // 6 vertices: 4 base corners + 2 ridge points
  const vertices = new Float32Array([
    // Front face (triangle)
    -w, 0, d,    // bottom left
    w, 0, d,     // bottom right
    0, h, d,     // top center (ridge)

    // Back face (triangle)
    w, 0, -d,    // bottom right
    -w, 0, -d,   // bottom left
    0, h, -d,    // top center (ridge)

    // Left slope (quad as 2 triangles)
    -w, 0, d,    // front bottom
    0, h, d,     // front top (ridge)
    0, h, -d,    // back top (ridge)
    -w, 0, d,    // front bottom
    0, h, -d,    // back top (ridge)
    -w, 0, -d,   // back bottom

    // Right slope (quad as 2 triangles)
    w, 0, d,     // front bottom
    0, h, -d,    // back top (ridge)
    0, h, d,     // front top (ridge)
    w, 0, d,     // front bottom
    w, 0, -d,    // back bottom
    0, h, -d,    // back top (ridge)

    // Bottom face (quad as 2 triangles) - for CSG to work properly
    -w, 0, d,
    -w, 0, -d,
    w, 0, -d,
    -w, 0, d,
    w, 0, -d,
    w, 0, d,
  ]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Creates a hip roof geometry with proper rectangular base
 * @param {number} width - Width of the house (X axis)
 * @param {number} depth - Depth of the house (Z axis)
 * @param {number} height - Peak height of the roof
 * @param {number} overhang - Eave overhang distance
 */
function createHipRoofGeometry(width, depth, height, overhang = 0.15) {
  const w = width / 2 + overhang;
  const d = depth / 2 + overhang;
  const h = height;

  // For hip roof, if rectangular, the ridge runs along the longer dimension
  // Ridge length = longerDim - shorterDim (so both hips have same slope)
  const isWider = width >= depth;
  const ridgeHalfLen = Math.abs(width - depth) / 4; // Half the ridge length

  let vertices;

  if (Math.abs(width - depth) < 0.1) {
    // Square footprint: simple pyramid with single apex
    vertices = new Float32Array([
      // Front face
      -w, 0, d,   w, 0, d,   0, h, 0,
      // Right face
      w, 0, d,    w, 0, -d,  0, h, 0,
      // Back face
      w, 0, -d,   -w, 0, -d, 0, h, 0,
      // Left face
      -w, 0, -d,  -w, 0, d,  0, h, 0,
      // Bottom
      -w, 0, d,   -w, 0, -d, w, 0, -d,
      -w, 0, d,   w, 0, -d,  w, 0, d,
    ]);
  } else if (isWider) {
    // Ridge runs along X axis
    const rx = ridgeHalfLen;
    vertices = new Float32Array([
      // Front face (trapezoid as 2 triangles)
      -w, 0, d,   w, 0, d,   rx, h, 0,
      -w, 0, d,   rx, h, 0,  -rx, h, 0,
      // Back face (trapezoid as 2 triangles)
      w, 0, -d,   -w, 0, -d, -rx, h, 0,
      w, 0, -d,   -rx, h, 0, rx, h, 0,
      // Left hip (triangle)
      -w, 0, d,   -rx, h, 0, -w, 0, -d,
      // Right hip (triangle)
      w, 0, d,    w, 0, -d,  rx, h, 0,
      // Ridge top (quad)
      -rx, h, 0,  rx, h, 0,  rx, h, 0,
      // Bottom
      -w, 0, d,   -w, 0, -d, w, 0, -d,
      -w, 0, d,   w, 0, -d,  w, 0, d,
    ]);
  } else {
    // Ridge runs along Z axis
    const rz = ridgeHalfLen;
    vertices = new Float32Array([
      // Front hip (triangle)
      -w, 0, d,   w, 0, d,   0, h, rz,
      // Back hip (triangle)
      w, 0, -d,   -w, 0, -d, 0, h, -rz,
      // Left face (trapezoid as 2 triangles)
      -w, 0, d,   0, h, rz,  0, h, -rz,
      -w, 0, d,   0, h, -rz, -w, 0, -d,
      // Right face (trapezoid as 2 triangles)
      w, 0, d,    0, h, -rz, 0, h, rz,
      w, 0, d,    w, 0, -d,  0, h, -rz,
      // Bottom
      -w, 0, d,   -w, 0, -d, w, 0, -d,
      -w, 0, d,   w, 0, -d,  w, 0, d,
    ]);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// ─── Material Presets ────────────────────────────────────────────────────────

const MATERIAL_PRESETS = {
  vinyl: { color: "#e8e2da", roughness: 0.7, metalness: 0 },
  brick: { color: "#8b4513", roughness: 0.9, metalness: 0 },
  stone: { color: "#8a9bb0", roughness: 0.95, metalness: 0 },
  stucco: { color: "#f5f0e8", roughness: 0.8, metalness: 0 },
  wood: { color: "#8b6f47", roughness: 0.75, metalness: 0 },
  asphaltShingle: { color: "#3a3a3a", roughness: 0.85, metalness: 0 },
  metalRoof: { color: "#5a6570", roughness: 0.3, metalness: 0.8 },
  tile: { color: "#8b4513", roughness: 0.6, metalness: 0 },
  slate: { color: "#4a5568", roughness: 0.7, metalness: 0.1 },
  concrete: { color: "#808080", roughness: 0.9, metalness: 0 },
  door: { color: "#4a3728", roughness: 0.6, metalness: 0 },
};

// ─── CSG Components ──────────────────────────────────────────────────────────

function Door(props) {
  return (
    <Subtraction {...props}>
      <Geometry>
        {/* Door opening - extended depth to cut through walls */}
        <Base geometry={box} scale={[1, 2, 2]} />
        <Addition geometry={cyl} scale={[0.5, 1, 0.5]} rotation={[Math.PI / 2, 0, 0]} position={[0, 1, 0]} />
      </Geometry>
    </Subtraction>
  );
}

function Window(props) {
  return (
    <Subtraction {...props}>
      <Geometry>
        {/* Main window opening - extended depth to cut through walls */}
        <Base geometry={box} scale={[1, 1, 2]} />
        {/* Window frame cross pieces */}
        <Subtraction geometry={box} scale={[0.05, 1, 2]} />
        <Subtraction geometry={box} scale={[1, 0.05, 2]} />
      </Geometry>
    </Subtraction>
  );
}

function Chimney(props) {
  return (
    <Addition name="chimney" {...props}>
      <Geometry>
        <Base name="base" geometry={box} scale={[1, 2, 1]} />
        <Subtraction name="hole" geometry={box} scale={[0.7, 2, 0.7]} position={[0, 0.5, 0]} />
      </Geometry>
    </Addition>
  );
}

// ─── House Model with CSG ────────────────────────────────────────────────────

function HouseCSG({
  width = 3,
  depth = 3,
  height = 3,
  stories = 1,
  roofType = "gable",
  wallColor = "#e8e2da",
  roofColor = "#3a3a3a",
  doorColor = "#4a3728",
  showChimney = true,
  showWindows = true,
  showDoor = true,
  interactive = false,
  envMapIntensity = 0.5,
  planWindows = [],
  planDoors = [],
  planRooms = [],
  onUpdate,
  onDragStart,
  onDragEnd,
  ...props
}) {
  const csgRef = useRef();

  // Scale based on stories
  const totalHeight = height * stories;

  // Check if we have floor plan data
  const hasFloorPlanWindows = planWindows && planWindows.length > 0;
  const hasFloorPlanDoors = planDoors && planDoors.length > 0;
  const hasFloorPlanRooms = planRooms && planRooms.length > 0;

  // Generate default positions (fallback when no floor plan)
  const getDefaultPositions = () => {
    const defaults = {};
    // Default windows
    defaults.frontLeftWindow = [-width * 0.25, totalHeight * 0.3, depth / 2];
    defaults.frontRightWindow = [width * 0.25, totalHeight * 0.3, depth / 2];
    defaults.rightWindow = [width / 2, totalHeight * 0.3, 0];
    defaults.leftWindow = [-width / 2, totalHeight * 0.3, 0];
    if (stories > 1) {
      defaults.upperLeftWindow = [-width * 0.25, totalHeight * 0.7, depth / 2];
      defaults.upperRightWindow = [width * 0.25, totalHeight * 0.7, depth / 2];
    }
    // Default door
    defaults.door = [0, -totalHeight * 0.2, depth / 2];
    return defaults;
  };

  // Get initial positions from floor plan or defaults
  const getInitialPositions = () => {
    const positions = {};

    // Use floor plan windows if available
    if (hasFloorPlanWindows) {
      planWindows.forEach((win, idx) => {
        positions[`planWindow_${idx}`] = win.position;
      });
    } else {
      // Use defaults
      Object.assign(positions, getDefaultPositions());
    }

    // Use floor plan doors if available
    if (hasFloorPlanDoors) {
      planDoors.forEach((door, idx) => {
        positions[`planDoor_${idx}`] = door.position;
      });
    } else {
      positions.door = [0, -totalHeight * 0.2, depth / 2];
    }

    return positions;
  };

  // State to track positions of interactive elements
  const [positions, setPositions] = useState(getInitialPositions);

  // Update positions when floor plan or dimensions change
  useMemo(() => {
    setPositions(getInitialPositions());
  }, [width, depth, totalHeight, planWindows, planDoors]);

  // Update CSG when positions change
  const updateCSG = () => {
    if (csgRef.current) {
      csgRef.current.update();
    }
    if (onUpdate) onUpdate();
  };

  // Create position updater for a specific element
  const createDragHandler = (key) => (matrix) => {
    const pos = new THREE.Vector3();
    pos.setFromMatrixPosition(matrix);
    setPositions(prev => ({
      ...prev,
      [key]: [
        prev[key][0] + pos.x,
        prev[key][1] + pos.y,
        prev[key][2] + pos.z,
      ],
    }));
    // Force CSG update after position change
    setTimeout(updateCSG, 0);
  };

  // Handle drag start/end to disable orbit controls during drag
  const handleDragStartLocal = () => {
    if (onDragStart) onDragStart();
  };

  const handleDragEndLocal = () => {
    if (onDragEnd) onDragEnd();
  };

  // Eave overhang: 1.5 feet = 0.15 in 3D units (at scale 0.1)
  const eaveOverhang = 0.15;

  // Roof pitch calculation: 5:12 pitch (rise/run = 5/12)
  const pitchRatio = 5 / 12;
  const gableRoofHeight = roofType === "flat"
    ? 0.15
    : (width / 2) * pitchRatio;
  const hipRoofHeight = roofType === "flat"
    ? 0.15
    : (Math.min(width, depth) / 2) * pitchRatio;
  const roofHeight = roofType === "hip" ? hipRoofHeight : gableRoofHeight;

  // Wall material — textured (Polyhaven stucco), tinted by wallColor.
  // Suspense is wrapped around the whole Canvas content via <Ground>, but
  // we still wrap this material render in a null-safe pattern below.
  const wallMaterial = (
    <TexturedMaterial
      textureSet="exteriorWall"
      color={wallColor}
      roughness={0.85}
      metalness={0}
      envMapIntensity={envMapIntensity}
    />
  );

  // Create roof geometries based on type and dimensions
  const gableRoofGeo = useMemo(
    () => createGableRoofGeometry(width, depth, roofHeight, eaveOverhang),
    [width, depth, roofHeight, eaveOverhang]
  );
  const hipRoofGeo = useMemo(
    () => createHipRoofGeometry(width, depth, roofHeight, eaveOverhang),
    [width, depth, roofHeight, eaveOverhang]
  );

  // Position house so bottom is at y=0 (lift by half totalHeight)
  const yOffset = totalHeight / 2;

  // Window frame material — dark trim around window openings (no glass)
  const winFrameColor = "#1a1a2e";
  // Door frame material — wood-look trim
  const doorFrameColor = "#3a2a1a";

  /**
   * Window frame — 4 outer beams + center mullion cross.
   * `side` determines orientation: left/right walls have frames in the YZ plane,
   * front/back (top/bottom/default) have frames in the XY plane.
   */
  const WindowFrame = ({ position, scale: s, side }) => {
    const t = 0.03; // frame beam thickness
    const w = s[0], h = s[1];
    const isSide = side === "left" || side === "right";

    // For front/back walls: frame lies in XY, thin in Z
    // For left/right walls: frame lies in ZY, thin in X
    const topBot = isSide ? [t, t, w + t * 2] : [w + t * 2, t, t];
    const leftRight = isSide ? [t, h, t] : [t, h, t];
    const crossH = isSide ? [t, 0.015, w] : [w, 0.015, t];
    const crossV = isSide ? [t, h, 0.015] : [0.015, h, t];
    // Side posts offset along the wide axis
    const halfW = w / 2;
    const lPos = isSide ? [0, 0, -halfW] : [-halfW, 0, 0];
    const rPos = isSide ? [0, 0, halfW] : [halfW, 0, 0];

    return (
      <group position={position}>
        <mesh position={[0, h / 2, 0]}><boxGeometry args={topBot} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
        <mesh position={[0, -h / 2, 0]}><boxGeometry args={topBot} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
        <mesh position={lPos}><boxGeometry args={leftRight} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
        <mesh position={rPos}><boxGeometry args={leftRight} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
        <mesh><boxGeometry args={crossH} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
        <mesh><boxGeometry args={crossV} /><meshStandardMaterial color={winFrameColor} roughness={0.3} metalness={0.4} /></mesh>
      </group>
    );
  };

  /**
   * Door frame — 3 beams (top + two sides), no solid panel.
   * `side` determines orientation like WindowFrame.
   */
  const DoorFrame = ({ position, scale: s, side }) => {
    const t = 0.04;
    const w = s[0] * 0.9, h = s[1] * 1.9;
    const isSide = side === "left" || side === "right";

    const topBar = isSide ? [t, t, w + t * 2] : [w + t * 2, t, t];
    const sideBar = isSide ? [t, h, t] : [t, h, t];
    const halfW = w / 2;
    const lPos = isSide ? [0, 0, -halfW] : [-halfW, 0, 0];
    const rPos = isSide ? [0, 0, halfW] : [halfW, 0, 0];

    return (
      <group position={position}>
        <mesh position={[0, h / 2, 0]}><boxGeometry args={topBar} /><meshStandardMaterial color={doorFrameColor} roughness={0.5} metalness={0.1} /></mesh>
        <mesh position={lPos}><boxGeometry args={sideBar} /><meshStandardMaterial color={doorFrameColor} roughness={0.5} metalness={0.1} /></mesh>
        <mesh position={rPos}><boxGeometry args={sideBar} /><meshStandardMaterial color={doorFrameColor} roughness={0.5} metalness={0.1} /></mesh>
      </group>
    );
  };

  return (
    <group {...props} position={[0, yOffset, 0]}>
      {/* Main house structure with CSG */}
      <mesh receiveShadow castShadow>
        <Geometry ref={csgRef} computeVertexNormals useGroups>
          {/* Base walls */}
          <Base name="base" geometry={box} scale={[width, totalHeight, depth]} />

          {/* Hollow interior */}
          <Subtraction
            name="cavity"
            geometry={box}
            scale={[width - 0.3, totalHeight - 0.3, depth - 0.3]}
          />

          {/* Flat roof only in CSG (simple box) */}
          {roofType === "flat" && (
            <Addition
              name="roof"
              geometry={box}
              scale={[width + eaveOverhang * 2, roofHeight, depth + eaveOverhang * 2]}
              position={[0, totalHeight / 2 + roofHeight / 2, 0]}
            />
          )}

          {/* Windows - from floor plan or defaults */}
          {showWindows && hasFloorPlanWindows && (
            <>
              {planWindows.map((win, idx) => (
                <Window
                  key={`planWin-${idx}`}
                  position={positions[`planWindow_${idx}`] || win.position}
                  scale={win.scale}
                  rotation={win.rotation}
                />
              ))}
            </>
          )}

          {/* Windows - default fallback when no floor plan */}
          {showWindows && !hasFloorPlanWindows && (
            <>
              <Window position={positions.frontLeftWindow || [-width * 0.25, totalHeight * 0.3, depth / 2]} scale={[0.5, 0.6, 0.25]} />
              <Window position={positions.frontRightWindow || [width * 0.25, totalHeight * 0.3, depth / 2]} scale={[0.5, 0.6, 0.25]} />
              <Window position={positions.rightWindow || [width / 2, totalHeight * 0.3, 0]} scale={[0.5, 0.6, 0.25]} rotation={[0, Math.PI / 2, 0]} />
              <Window position={positions.leftWindow || [-width / 2, totalHeight * 0.3, 0]} scale={[0.5, 0.6, 0.25]} rotation={[0, Math.PI / 2, 0]} />
              {stories > 1 && (
                <>
                  <Window position={positions.upperLeftWindow || [-width * 0.25, totalHeight * 0.7, depth / 2]} scale={[0.5, 0.6, 0.25]} />
                  <Window position={positions.upperRightWindow || [width * 0.25, totalHeight * 0.7, depth / 2]} scale={[0.5, 0.6, 0.25]} />
                </>
              )}
            </>
          )}

          {/* Doors - from floor plan */}
          {showDoor && hasFloorPlanDoors && (
            <>
              {planDoors.map((door, idx) => (
                <Door
                  key={`planDoor-${idx}`}
                  position={positions[`planDoor_${idx}`] || door.position}
                  scale={door.scale}
                />
              ))}
            </>
          )}

          {/* Door - default fallback */}
          {showDoor && !hasFloorPlanDoors && (
            <Door position={positions.door || [0, -totalHeight * 0.2, depth / 2]} scale={[0.6, 0.7, 0.25]} />
          )}
        </Geometry>
        {wallMaterial}
      </mesh>

      {/* Gable Roof - rendered as separate mesh for proper geometry */}
      {roofType === "gable" && (
        <mesh
          geometry={gableRoofGeo}
          position={[0, totalHeight / 2, 0]}
          receiveShadow
          castShadow
        >
          <TexturedMaterial textureSet="roof" color={roofColor} roughness={0.85} />
        </mesh>
      )}

      {/* Hip Roof - rendered as separate mesh for proper geometry */}
      {roofType === "hip" && (
        <mesh
          geometry={hipRoofGeo}
          position={[0, totalHeight / 2, 0]}
          receiveShadow
          castShadow
        >
          <TexturedMaterial textureSet="roof" color={roofColor} roughness={0.85} />
        </mesh>
      )}

      {/* Chimney - positioned on roof surface */}
      {showChimney && roofType !== "flat" && (
        <group position={[-width * 0.2, totalHeight / 2, depth * 0.15]}>
          <mesh position={[0, roofHeight * 0.5 + 0.3, 0]} castShadow>
            <boxGeometry args={[0.4, roofHeight + 0.6, 0.4]} />
            <meshStandardMaterial color="#8b4513" roughness={0.9} />
          </mesh>
          <mesh position={[0, roofHeight + 0.65, 0]} castShadow>
            <boxGeometry args={[0.5, 0.1, 0.5]} />
            <meshStandardMaterial color="#606060" roughness={0.8} />
          </mesh>
        </group>
      )}

      {/* Interior floor - visible through windows */}
      <mesh position={[0, -totalHeight / 2 + 0.05, 0]}>
        <boxGeometry args={[width - 0.35, 0.1, depth - 0.35]} />
        <meshStandardMaterial color="#8B7355" roughness={0.8} />
      </mesh>

      {/* Interior back wall - for depth perception (only if no room walls) */}
      {!hasFloorPlanRooms && (
        <mesh position={[0, 0, -depth / 2 + 0.2]}>
          <boxGeometry args={[width - 0.35, totalHeight - 0.35, 0.05]} />
          <meshStandardMaterial color="#f5f0e8" roughness={0.9} />
        </mesh>
      )}

      {/* Internal room walls from floor plan */}
      {hasFloorPlanRooms && (
        <group>
          {planRooms.map((wall) => (
            <mesh key={wall.id} position={wall.position}>
              <boxGeometry args={wall.size} />
              <meshStandardMaterial color="#f0ebe3" roughness={0.85} />
            </mesh>
          ))}
        </group>
      )}

      {/* Foundation */}
      <mesh position={[0, -totalHeight / 2 - 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[width + 0.1, 0.3, depth + 0.1]} />
        <meshStandardMaterial color="#606060" roughness={0.9} />
      </mesh>

      {/* ── Window frames (both modes — identical look) ── */}
      {showWindows && hasFloorPlanWindows && (
        <group>
          {planWindows.map((win, idx) => (
            <WindowFrame
              key={`wf-${idx}`}
              position={positions[`planWindow_${idx}`] || win.position}
              scale={win.scale}
              side={win.side}
            />
          ))}
        </group>
      )}
      {showWindows && !hasFloorPlanWindows && (
        <group>
          <WindowFrame position={positions.frontLeftWindow || [-width * 0.25, totalHeight * 0.3, depth / 2]} scale={[0.5, 0.6, 0.25]} side="bottom" />
          <WindowFrame position={positions.frontRightWindow || [width * 0.25, totalHeight * 0.3, depth / 2]} scale={[0.5, 0.6, 0.25]} side="bottom" />
          <WindowFrame position={positions.rightWindow || [width / 2, totalHeight * 0.3, 0]} scale={[0.5, 0.6, 0.25]} side="right" />
          <WindowFrame position={positions.leftWindow || [-width / 2, totalHeight * 0.3, 0]} scale={[0.5, 0.6, 0.25]} side="left" />
          {stories > 1 && (
            <>
              <WindowFrame position={positions.upperLeftWindow || [-width * 0.25, totalHeight * 0.7, depth / 2]} scale={[0.5, 0.6, 0.25]} side="bottom" />
              <WindowFrame position={positions.upperRightWindow || [width * 0.25, totalHeight * 0.7, depth / 2]} scale={[0.5, 0.6, 0.25]} side="bottom" />
            </>
          )}
        </group>
      )}

      {/* ── Door frames (both modes — frame only, no solid panel) ── */}
      {showDoor && hasFloorPlanDoors && (
        <group>
          {planDoors.map((door, idx) => (
            <DoorFrame
              key={`df-${idx}`}
              position={positions[`planDoor_${idx}`] || door.position}
              scale={door.scale}
              side={door.side}
            />
          ))}
        </group>
      )}
      {showDoor && !hasFloorPlanDoors && (
        <DoorFrame
          position={positions.door || [0, -totalHeight * 0.2, depth / 2]}
          scale={[0.6, 0.7, 0.25]}
          side="bottom"
        />
      )}
    </group>
  );
}

// ─── Textured material wrapper — loads Polyhaven PBR maps under Suspense ────

function TexturedMaterialInner({ textureSet, ...rest }) {
  const maps = useTextureSet(textureSet);
  return <meshStandardMaterial attach="material" {...maps} {...rest} />;
}

function TexturedMaterial({ textureSet, ...rest }) {
  return (
    <Suspense fallback={<meshStandardMaterial attach="material" {...rest} />}>
      <TexturedMaterialInner textureSet={textureSet} {...rest} />
    </Suspense>
  );
}

// ─── Ground Plane ────────────────────────────────────────────────────────────

function TexturedGround({ size }) {
  const maps = useTextureSet("grass");
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      {/* Muted sage tint — keeps the sparse grass texture but prevents it
          from reading as loud or saturated against the house. */}
      <meshStandardMaterial {...maps} color="#b8c0a8" roughness={0.95} />
    </mesh>
  );
}

function Ground({ size = 50 }) {
  return (
    <Suspense fallback={
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color="#3d5c3d" roughness={0.9} />
      </mesh>
    }>
      <TexturedGround size={size} />
    </Suspense>
  );
}

// ─── Grass Patches ───────────────────────────────────────────────────────────

function GrassPatches() {
  const patches = useMemo(() => {
    const arr = [];
    for (let i = 0; i < 20; i++) {
      arr.push({
        position: [
          (Math.random() - 0.5) * 15,
          0.02,
          (Math.random() - 0.5) * 15,
        ],
        scale: 0.3 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI,
      });
    }
    return arr;
  }, []);

  return (
    <group>
      {patches.map((p, i) => (
        <mesh key={i} position={p.position} rotation={[0, p.rotation, 0]} scale={p.scale}>
          <sphereGeometry args={[0.3, 8, 4]} />
          <meshStandardMaterial color="#4a7c4a" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Scene Setup ─────────────────────────────────────────────────────────────

function Scene({
  houseProps,
  showGround = true,
  showSky = true,
  showGrass = true,
  isDragging = false,
}) {
  // Calculate dynamic camera position based on house size and stories
  const { stories = 1, width = 3, depth = 3, height = 2.5, roofType = "gable" } = houseProps;
  const totalHeight = height * stories;
  // Calculate roof height using same 5:12 pitch as HouseCSG
  const pitchRatio = 5 / 12;
  const roofHeight = roofType === "flat"
    ? 0.15
    : roofType === "hip"
      ? (Math.min(width, depth) / 2) * pitchRatio
      : (width / 2) * pitchRatio;
  const fullHouseHeight = totalHeight + roofHeight;
  const maxDimension = Math.max(width, depth, fullHouseHeight);

  // Position camera further back for larger/taller buildings
  const cameraDistance = Math.max(8, maxDimension * 2);
  const cameraHeight = Math.max(5, fullHouseHeight * 0.8);
  // Target center of the house (which is now lifted so bottom is at y=0)
  const targetHeight = fullHouseHeight * 0.45;

  return (
    <>
      {/* Camera */}
      <PerspectiveCamera
        makeDefault
        position={[cameraDistance, cameraHeight, cameraDistance]}
        fov={50}
      />

      {/* Orbit Controls - disabled while dragging */}
      <OrbitControls
        enablePan={!isDragging}
        enableZoom={!isDragging}
        enableRotate={!isDragging}
        minDistance={3}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2 - 0.05}
        target={[0, targetHeight, 0]}
      />

      {/* ── Soft shadows (PCSS-style) — single call per scene ── */}
      <SoftShadows size={24} samples={16} focus={0.7} />

      {/* ── Lighting — warm key + cool fill + sky hemisphere ── */}
      <hemisphereLight args={["#cfe7ff", "#3b2a1a", 0.55]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[14, 20, 10]}
        intensity={2.2}
        color="#fff3df"
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-camera-far={60}
        shadow-camera-left={-maxDimension}
        shadow-camera-right={maxDimension}
        shadow-camera-top={maxDimension}
        shadow-camera-bottom={-maxDimension}
      />
      {/* Rim light for edge separation */}
      <directionalLight position={[-8, 10, -6]} intensity={0.35} color="#b4c6ff" />

      {/* Sky — backdrop when not using env ground-projection */}
      {showSky && <Sky sunPosition={[100, 20, 100]} turbidity={6} rayleigh={0.9} mieCoefficient={0.005} />}

      {/* Image-based lighting — "sunset" gives warmer architectural reflections than "city" */}
      <Environment preset="sunset" />

      {/* Ground */}
      {showGround && <Ground />}

      {/* Grass decorations */}
      {showGrass && <GrassPatches />}

      {/* Contact shadow under the house — grounds it visually */}
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={0.75}
        scale={Math.max(30, maxDimension * 3)}
        blur={2.4}
        far={8}
        resolution={1024}
      />

      {/* House — prefer the plan-driven geometry when the floor plan has rooms.
          Falls back to the parametric HouseCSG box when no plan is available. */}
      {planIsRenderable(houseProps.floorPlan, houseProps.storyPlans) ? (
        <PlanHouse plan={houseProps.floorPlan} stories={houseProps.storyPlans} />
      ) : (
        <HouseCSG {...houseProps} />
      )}

      {/* ── Post-processing — subtle SSAO + soft bloom + vignette ── */}
      <EffectComposer multisampling={0} disableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={16}
          rings={4}
          distanceThreshold={0.6}
          distanceFalloff={0.15}
          rangeThreshold={0.01}
          rangeFalloff={0.005}
          luminanceInfluence={0.7}
          radius={4}
          bias={0.035}
          intensity={18}
        />
        <Bloom
          intensity={0.35}
          luminanceThreshold={0.85}
          luminanceSmoothing={0.2}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.2} darkness={0.55} />
        <SMAA />
      </EffectComposer>
    </>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

// ─── Floor Plan to 3D Conversion ──────────────────────────────────────────────

/**
 * Converts 2D floor plan window positions to 3D coordinates
 * Floor plan: origin top-left, y increases downward, units in feet
 * 3D: origin at center, y is up, z is depth (positive = front), scale 0.1
 */
function convertWindowsTo3D(floorPlan, scale, w3d, d3d, totalHeight) {
  if (!floorPlan?.windows?.length) return [];

  const fpWidth = floorPlan.width || 40;
  const fpDepth = floorPlan.depth || 30;

  return floorPlan.windows.map((win, idx) => {
    const winWidth = (win.width || 3) * scale;
    const winHeight = 0.6; // Standard window height in 3D units
    // Default Y position: 30% up from bottom of first floor
    const yPos = totalHeight * 0.3;

    let x, z, rotation;

    switch (win.side) {
      case "bottom": // Front of house (positive Z)
        x = (win.x - fpWidth / 2) * scale;
        z = d3d / 2;
        rotation = null;
        break;
      case "top": // Back of house (negative Z)
        x = (win.x - fpWidth / 2) * scale;
        z = -d3d / 2;
        rotation = null;
        break;
      case "left": // Left side (negative X)
        x = -w3d / 2;
        z = -(win.y - fpDepth / 2) * scale;
        rotation = [0, Math.PI / 2, 0];
        break;
      case "right": // Right side (positive X)
        x = w3d / 2;
        z = -(win.y - fpDepth / 2) * scale;
        rotation = [0, Math.PI / 2, 0];
        break;
      default:
        x = 0;
        z = d3d / 2;
        rotation = null;
    }

    return {
      id: `window-${idx}`,
      position: [x, yPos, z],
      scale: [winWidth, winHeight, 0.25],
      rotation,
      side: win.side,
    };
  });
}

/**
 * Converts 2D floor plan rooms to 3D internal wall segments
 * Creates walls along room boundaries (excluding exterior walls)
 */
function convertRoomsToWalls(floorPlan, scale, _w3d, _d3d, totalHeight) {
  if (!floorPlan?.rooms?.length) return [];

  const fpWidth = floorPlan.width || 40;
  const fpDepth = floorPlan.depth || 30;
  const wallThickness = 0.05; // Wall thickness in 3D units
  const wallHeight = totalHeight * 0.95; // Slightly less than full height

  const walls = [];
  const rooms = floorPlan.rooms;

  // For each room, check each edge - if it's not on the exterior boundary,
  // create an internal wall segment
  rooms.forEach((room, roomIdx) => {
    if (!room.isRoom && !room.type) return; // Skip non-room items

    const roomW = room.w * scale;
    const roomH = room.h * scale;

    // Convert 2D coordinates to 3D (origin at center)
    // 2D: x goes right, y goes down (top-left origin)
    // 3D: x goes right, z goes back (center origin)
    const x3d = (room.x - fpWidth / 2) * scale;
    const z3d = -(room.y - fpDepth / 2) * scale; // Flip Y to Z

    // Check each edge of the room
    const edges = [
      { side: 'top', x: x3d + roomW / 2, z: z3d, w: roomW, isHorizontal: true },
      { side: 'bottom', x: x3d + roomW / 2, z: z3d - roomH, w: roomW, isHorizontal: true },
      { side: 'left', x: x3d, z: z3d - roomH / 2, w: roomH, isHorizontal: false },
      { side: 'right', x: x3d + roomW, z: z3d - roomH / 2, w: roomH, isHorizontal: false },
    ];

    edges.forEach((edge, edgeIdx) => {
      // Check if this edge is on the exterior boundary
      const isExterior =
        (edge.side === 'top' && Math.abs(room.y) < 0.5) ||
        (edge.side === 'bottom' && Math.abs(room.y + room.h - fpDepth) < 0.5) ||
        (edge.side === 'left' && Math.abs(room.x) < 0.5) ||
        (edge.side === 'right' && Math.abs(room.x + room.w - fpWidth) < 0.5);

      if (!isExterior) {
        walls.push({
          id: `wall-${roomIdx}-${edgeIdx}`,
          position: [edge.x, 0, edge.z],
          size: edge.isHorizontal
            ? [edge.w, wallHeight, wallThickness]
            : [wallThickness, wallHeight, edge.w],
          roomType: room.type,
          roomLabel: room.label,
        });
      }
    });
  });

  return walls;
}

/**
 * Converts 2D floor plan door positions to 3D coordinates
 */
function convertDoorsTo3D(floorPlan, scale, w3d, d3d, totalHeight) {
  if (!floorPlan?.doors?.length) return [];

  const fpWidth = floorPlan.width || 40;
  const fpDepth = floorPlan.depth || 30;

  return floorPlan.doors.map((door, idx) => {
    const doorWidth = (door.width || 3) * scale;
    const doorHeight = 0.7; // Door height scale factor
    // Door Y position: bottom of the wall (20% down from center)
    const yPos = -totalHeight * 0.2;

    let x, z;

    switch (door.side) {
      case "bottom": // Front of house
        x = (door.x - fpWidth / 2) * scale;
        z = d3d / 2;
        break;
      case "top": // Back of house
        x = (door.x - fpWidth / 2) * scale;
        z = -d3d / 2;
        break;
      case "left":
        x = -w3d / 2;
        z = -(door.y - fpDepth / 2) * scale;
        break;
      case "right":
        x = w3d / 2;
        z = -(door.y - fpDepth / 2) * scale;
        break;
      default:
        x = 0;
        z = d3d / 2;
    }

    return {
      id: `door-${idx}`,
      position: [x, yPos, z],
      scale: [doorWidth, doorHeight, 0.25],
      isExterior: door.isExterior !== false,
      side: door.side,
    };
  });
}

export default function House3D({
  width = 40,
  depth = 30,
  stories = 1,
  roofType = "gable",
  wallMaterial = "vinyl",
  roofMaterial = "asphaltShingle",
  wallColor,
  roofColor,
  doorColor = "#4a3728",
  vizMode = "standard",
  showFoundation = true,
  showRoof = true,
  showWindows = true,
  showDoor = true,
  showChimney = true,
  showGround = true,
  showSky = true,
  showGrass = false,
  interactive = false,
  floorPlan = null,
  storyPlans = null,
  style = {},
  className = "",
}) {
  const [isDragging, setIsDragging] = useState(false);
  // Convert feet to 3D units (scale down for better viewing)
  // Using consistent scale for all dimensions to maintain proper proportions
  const scale = 0.1; // 1 foot = 0.1 3D units
  const w = Math.max(2, width * scale);
  const d = Math.max(2, depth * scale);
  const storyHeightFt = 10; // Typical story height in feet
  const h = storyHeightFt * scale; // Height per story in 3D units (1.0)
  const totalHeight = h * stories;

  // Get colors from presets if not specified
  const finalWallColor = wallColor || MATERIAL_PRESETS[wallMaterial]?.color || "#e8e2da";
  const finalRoofColor = roofColor || MATERIAL_PRESETS[roofMaterial]?.color || "#3a3a3a";

  // Convert floor plan windows/doors/rooms to 3D positions
  const planWindows = useMemo(
    () => convertWindowsTo3D(floorPlan, scale, w, d, totalHeight),
    [floorPlan, scale, w, d, totalHeight]
  );
  const planDoors = useMemo(
    () => convertDoorsTo3D(floorPlan, scale, w, d, totalHeight),
    [floorPlan, scale, w, d, totalHeight]
  );
  const planRooms = useMemo(
    () => convertRoomsToWalls(floorPlan, scale, w, d, totalHeight),
    [floorPlan, scale, w, d, totalHeight]
  );

  const houseProps = {
    width: w,
    depth: d,
    height: h, // Story height in 3D units (proportional to floor dimensions)
    stories,
    roofType,
    wallColor: finalWallColor,
    roofColor: finalRoofColor,
    doorColor,
    showChimney: showChimney && roofType !== "flat",
    showWindows,
    showDoor,
    interactive,
    envMapIntensity: vizMode === "ghost" ? 0.1 : 0.5,
    onDragStart: () => setIsDragging(true),
    onDragEnd: () => setIsDragging(false),
    // Pass floor plan window/door/room data
    planWindows,
    planDoors,
    planRooms,
    // Raw plan(s) — Scene uses these to decide between PlanHouse (plan-driven)
    // and HouseCSG (parametric) rendering. storyPlans is the full multi-story
    // array when available; floorPlan is the single active story.
    floorPlan,
    storyPlans,
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#87CEEB", ...style }} className={className}>
      <Canvas
        shadows="soft"
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          outputColorSpace: THREE.SRGBColorSpace,
          powerPreference: "high-performance",
        }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#87CEEB"]} />
        <Scene
          houseProps={houseProps}
          showGround={showGround}
          showSky={showSky}
          showGrass={showGrass}
          isDragging={isDragging}
        />
      </Canvas>
    </div>
  );
}

// ─── Named Exports ───────────────────────────────────────────────────────────

export { HouseCSG, Scene, Ground, Door, Window, Chimney, MATERIAL_PRESETS };
