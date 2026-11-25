import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
} from 'react';
import * as THREE from 'three';
import { buildProductTextures, type Studio3DConfig } from '../lib/studio3dTextures';

export interface Studio3DCanvasHandle {
  captureSnapshot: () => string | undefined;
}

interface Studio3DCanvasProps {
  config: Studio3DConfig;
  viewTarget: 'front' | 'back' | 'reset';
  viewNonce: number;
  onSideChange?: (showingBack: boolean) => void;
}

function canUseWebGL(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined' ||
    (typeof navigator !== 'undefined' && navigator.userAgent?.includes('jsdom'))
  ) {
    return false;
  }
  try {
    const test = document.createElement('canvas');
    return Boolean(test.getContext('webgl2') || test.getContext('webgl'));
  } catch {
    return false;
  }
}

function disposeGroup(group: THREE.Group) {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (m && typeof m.dispose === 'function') m.dispose();
      }
    }
  });
  group.clear();
}

function roundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const radius = Math.min(r, hw, hh);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + radius, -hh);
  shape.lineTo(hw - radius, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + radius);
  shape.lineTo(hw, hh - radius);
  shape.quadraticCurveTo(hw, hh, hw - radius, hh);
  shape.lineTo(-hw + radius, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - radius);
  shape.lineTo(-hw, -hh + radius);
  shape.quadraticCurveTo(-hw, -hh, -hw + radius, -hh);
  return shape;
}

function paddleBrushShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -1.55);
  s.bezierCurveTo(0.16, -1.55, 0.2, -1.1, 0.14, -0.58);
  s.bezierCurveTo(0.11, -0.25, 0.68, -0.05, 0.68, 0.62);
  s.bezierCurveTo(0.68, 1.24, 0.36, 1.56, 0, 1.56);
  s.bezierCurveTo(-0.36, 1.56, -0.68, 1.24, -0.68, 0.62);
  s.bezierCurveTo(-0.68, -0.05, -0.11, -0.25, -0.14, -0.58);
  s.bezierCurveTo(-0.2, -1.1, -0.16, -1.55, 0, -1.55);
  return s;
}

function keychainBodyShape(w: number, h: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const s = new THREE.Shape();
  const tabW = 0.24;
  const tabH = 0.22;
  const r = 0.12;
  s.moveTo(-hw + r, -hh);
  s.lineTo(hw - r, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + r);
  s.lineTo(hw, hh - r);
  s.quadraticCurveTo(hw, hh, hw - r, hh);
  s.lineTo(tabW, hh);
  s.quadraticCurveTo(tabW * 0.65, hh + tabH, 0, hh + tabH);
  s.quadraticCurveTo(-tabW * 0.65, hh + tabH, -tabW, hh);
  s.lineTo(-hw + r, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - r);
  s.lineTo(-hw, -hh + r);
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

  const hole = new THREE.Path();
  hole.absarc(0, hh + 0.1, 0.055, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return s;
}

function buildMeshForService(
  config: Studio3DConfig,
  frontMat: THREE.MeshStandardMaterial,
  backMat: THREE.MeshStandardMaterial,
): THREE.Group {
  const root = new THREE.Group();
  const isGloss = config.laminationFinish === 'Glossy';

  if (config.serviceId === 'mug-customization') {
    const tall = config.sizeId === '15oz';
    const radius = tall ? 0.94 : 0.88;
    const height = tall ? 2.45 : 2.1;
    const halfH = height / 2;

    const ceramicMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbfbfc,
      roughness: 0.15,
      metalness: 0.02,
      clearcoat: 0.92,
      clearcoatRoughness: 0.12,
    });

    const profile = [
      new THREE.Vector2(0, -halfH + 0.12),
      new THREE.Vector2(radius - 0.12, -halfH + 0.12),
      new THREE.Vector2(radius - 0.1, halfH - 0.04),
      new THREE.Vector2(radius - 0.05, halfH),
      new THREE.Vector2(radius, halfH - 0.04),
      new THREE.Vector2(radius, -halfH + 0.08),
      new THREE.Vector2(radius - 0.06, -halfH),
      new THREE.Vector2(0, -halfH),
    ];
    const mugBody = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), ceramicMat);
    mugBody.castShadow = true;
    mugBody.receiveShadow = true;
    root.add(mugBody);

    // Sculpted C-handle joined cleanly at +X
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(radius - 0.06, halfH * 0.58, 0),
      new THREE.Vector3(radius + 0.56, halfH * 0.62, 0),
      new THREE.Vector3(radius + 0.62, 0, 0),
      new THREE.Vector3(radius + 0.54, -halfH * 0.62, 0),
      new THREE.Vector3(radius - 0.06, -halfH * 0.56, 0),
    ]);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, 0.11, 18, false), ceramicMat);
    handle.castShadow = true;
    root.add(handle);

    // Curved Front & Back print wraps (leaves ceramic gap cleanly around handle)
    const printH = height * 0.84;
    const frontArc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.008, radius + 0.008, printH, 48, 1, true, -0.88, 1.76),
      frontMat,
    );
    const backArc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius + 0.008, radius + 0.008, printH, 48, 1, true, Math.PI - 0.88, 1.76),
      backMat,
    );
    root.add(frontArc, backArc);
    root.position.x = -0.16;
    root.rotation.y = -0.25;
    return root;
  }

  if (config.serviceId === 'custom-keychains') {
    const isSq = config.sizeId === 'square';
    const w = isSq ? 1.55 : 1.18;
    const h = isSq ? 1.55 : 2.15;
    const body = keychainBodyShape(w, h);
    const acrylicGeo = new THREE.ExtrudeGeometry(body, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.025,
      bevelSegments: 4,
    });
    acrylicGeo.translate(0, 0, -0.07);
    const acrylicMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.07,
      metalness: 0.02,
      transmission: 0.62,
      thickness: 0.18,
      ior: 1.49,
      clearcoat: 1,
      transparent: true,
      opacity: 0.92,
    });
    const acrylic = new THREE.Mesh(acrylicGeo, acrylicMat);
    acrylic.castShadow = true;
    root.add(acrylic);

    const cardW = w - 0.18;
    const cardH = h - 0.18;
    const frontCard = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), frontMat);
    frontCard.position.z = 0.028;
    const backCard = new THREE.Mesh(new THREE.PlaneGeometry(cardW, cardH), backMat);
    backCard.position.z = -0.028;
    backCard.rotation.y = Math.PI;
    root.add(frontCard, backCard);

    const silverMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.92, roughness: 0.18 });
    const jumpRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 12, 28), silverMat);
    jumpRing.position.set(0, h / 2 + 0.17, 0);
    jumpRing.rotation.y = Math.PI / 2;
    const splitRing1 = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.024, 14, 40), silverMat);
    splitRing1.position.set(0, h / 2 + 0.49, 0.012);
    const splitRing2 = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.022, 14, 40), silverMat);
    splitRing2.position.set(0, h / 2 + 0.49, -0.014);
    root.add(jumpRing, splitRing1, splitRing2);
    root.position.y = -0.16;
    return root;
  }

  if (config.serviceId === 'refrigerator-magnets') {
    const large = config.sizeId === 'medium';
    const w = large ? 1.88 : 1.66;
    const h = large ? 2.42 : 2.16;
    const slabGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, 0.1), {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.02,
      bevelSegments: 3,
    });
    slabGeo.translate(0, 0, -0.07);
    const slabMat = new THREE.MeshPhysicalMaterial({
      color: 0xf7f8fa,
      roughness: 0.12,
      clearcoat: 0.95,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.castShadow = true;
    root.add(slab);

    const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), frontMat);
    frontFace.position.z = 0.098;
    const backFace = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), backMat);
    backFace.position.z = -0.098;
    backFace.rotation.y = Math.PI;
    root.add(frontFace, backFace);

    // 3D magnetic bar strip attached on the back
    const magBar = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.72, 0.24, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.58, metalness: 0.2 }),
    );
    magBar.position.set(0, -h * 0.28, -0.118);
    root.add(magBar);
    return root;
  }

  if (config.serviceId === 'sintra-board') {
    const w = config.sizeId === '8x10' ? 1.95 : 1.78;
    const h = config.sizeId === 'a3' ? 2.52 : 2.38;
    const pvcMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.45 });
    const slabGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, 0.05), {
      depth: 0.11,
      bevelEnabled: true,
      bevelThickness: 0.015,
      bevelSize: 0.012,
      bevelSegments: 2,
    });
    slabGeo.translate(0, 0, -0.055);
    const slab = new THREE.Mesh(slabGeo, pvcMat);
    slab.castShadow = true;
    root.add(slab);

    const frontFace = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), frontMat);
    frontFace.position.z = 0.072;
    const backFace = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), backMat);
    backFace.position.z = -0.072;
    backFace.rotation.y = Math.PI;
    root.add(frontFace, backFace);

    // Molded 3D back wall-mount bracket
    const mountPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.44, 0.22, 0.03),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
    );
    mountPlate.position.set(0, h / 2 - 0.24, -0.088);
    const mountSlot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.035, 20),
      new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.6 }),
    );
    mountSlot.rotation.x = Math.PI / 2;
    mountSlot.position.set(0, h / 2 - 0.24, -0.09);
    root.add(mountPlate, mountSlot);
    return root;
  }

  if (config.serviceId === 'laser-engraving') {
    const woodEdgeMat = new THREE.MeshStandardMaterial({ color: 0xd2a86e, roughness: 0.62 });
    if (config.sizeId === 'pen') {
      const len = 2.65;
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.16, len * 0.68, 36),
        frontMat,
      );
      barrel.castShadow = true;
      const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e5ea, metalness: 0.9, roughness: 0.2 });
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.48, 32), chromeMat);
      tip.position.y = -(len * 0.34 + 0.24);
      tip.rotation.z = Math.PI;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.155, 0.34, 32), chromeMat);
      cap.position.y = len * 0.34 + 0.17;
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.85, 0.07), chromeMat);
      clip.position.set(0.18, len * 0.16, 0);
      root.add(barrel, tip, cap, clip);
      root.rotation.z = -0.45;
      return root;
    }

    if (config.sizeId === 'brush') {
      const geo = new THREE.ExtrudeGeometry(paddleBrushShape(), {
        depth: 0.14,
        bevelEnabled: true,
        bevelThickness: 0.035,
        bevelSize: 0.025,
        bevelSegments: 4,
      });
      geo.translate(0, 0, -0.07);
      const paddle = new THREE.Mesh(geo, woodEdgeMat);
      paddle.castShadow = true;
      root.add(paddle);

      const frontFace = new THREE.Mesh(new THREE.ShapeGeometry(paddleBrushShape()), frontMat);
      frontFace.position.z = 0.107;
      // Shape UVs range across [-0.68..0.68, -1.55..1.56]; normalize UVs cleanly onto [0..1]
      const uvAttr = frontFace.geometry.attributes.uv;
      const posAttr = frontFace.geometry.attributes.position;
      if (uvAttr && posAttr) {
        for (let i = 0; i < posAttr.count; i += 1) {
          const x = posAttr.getX(i);
          const y = posAttr.getY(i);
          uvAttr.setXY(i, (x + 0.68) / 1.36, (y + 1.55) / 3.11);
        }
        uvAttr.needsUpdate = true;
      }
      const backWood = new THREE.Mesh(frontFace.geometry.clone(), backMat);
      backWood.position.z = -0.107;
      backWood.rotation.y = Math.PI;
      root.add(frontFace, backWood);

      // Raised black rubber cushion + 3D bamboo bristles on the back head
      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.58, 0.08, 36),
        new THREE.MeshStandardMaterial({ color: 0x202022, roughness: 0.78 }),
      );
      pad.scale.set(0.95, 1, 1.32);
      pad.rotation.x = Math.PI / 2;
      pad.position.set(0, 0.66, -0.145);
      root.add(pad);

      const pinGeo = new THREE.CapsuleGeometry(0.02, 0.16, 4, 8);
      const pinMat = new THREE.MeshStandardMaterial({ color: 0xe5c48c, roughness: 0.52 });
      const coords: Array<[number, number]> = [];
      for (let rx = -4; rx <= 4; rx += 1) {
        for (let ry = -5; ry <= 5; ry += 1) {
          const px = rx * 0.115;
          const py = ry * 0.12;
          if ((px * px) / 0.24 + (py * py) / 0.45 <= 1) {
            coords.push([px, 0.66 + py]);
          }
        }
      }
      const pins = new THREE.InstancedMesh(pinGeo, pinMat, coords.length);
      const dummy = new THREE.Object3D();
      coords.forEach(([px, py], i) => {
        dummy.position.set(px, py, -0.26);
        dummy.rotation.x = Math.PI / 2;
        dummy.updateMatrix();
        pins.setMatrixAt(i, dummy.matrix);
      });
      root.add(pins);
      return root;
    }

    // Wood Plaque
    const plaqueGeo = new THREE.ExtrudeGeometry(roundedRectShape(1.9, 2.4, 0.08), {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.03,
      bevelSegments: 3,
    });
    plaqueGeo.translate(0, 0, -0.09);
    const plaque = new THREE.Mesh(plaqueGeo, woodEdgeMat);
    plaque.castShadow = true;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 2.24), frontMat);
    f.position.z = 0.132;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.76, 2.24), backMat);
    b.position.z = -0.132;
    b.rotation.y = Math.PI;
    root.add(plaque, f, b);
    return root;
  }

  if (config.serviceId === 'lamination') {
    const w = config.sizeId === 'id' ? 1.55 : 1.85;
    const h = config.sizeId === 'id' ? 2.25 : 2.45;
    const pouchGeo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, 0.1), {
      depth: 0.035,
      bevelEnabled: true,
      bevelThickness: 0.008,
      bevelSize: 0.01,
      bevelSegments: 2,
    });
    pouchGeo.translate(0, 0, -0.0175);
    const pouch = new THREE.Mesh(
      pouchGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: isGloss ? 0.08 : 0.48,
        clearcoat: isGloss ? 1 : 0.15,
        transmission: 0.45,
        transparent: true,
        opacity: 0.9,
      }),
    );
    pouch.castShadow = true;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h - 0.12), frontMat);
    f.position.z = 0.028;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.12, h - 0.12), backMat);
    b.position.z = -0.028;
    b.rotation.y = Math.PI;
    root.add(pouch, f, b);
    return root;
  }

  if (config.serviceId === 'document-printing') {
    const isStack = config.sizeId === 'a4' || config.sizeId === 'short';
    const w = config.sizeId === '8x8' || config.sizeId === '4x4' ? 2.0 : 1.85;
    const h = config.sizeId === '8x8' || config.sizeId === '4x4' ? 2.0 : 2.45;
    const paperMat = new THREE.MeshStandardMaterial({ color: 0xfefefe, roughness: 0.72 });
    const count = isStack ? 4 : 1;
    for (let i = 0; i < count; i += 1) {
      const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.025), paperMat);
      sheet.position.set(i * 0.03 - 0.04, -i * 0.025, -i * 0.032);
      sheet.rotation.z = (i - 1) * 0.018;
      sheet.castShadow = i === 0;
      root.add(sheet);
    }
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), frontMat);
    f.position.set(-0.04, 0, 0.016);
    f.rotation.z = -0.018;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), backMat);
    b.position.set((count - 1) * 0.03 - 0.04, -(count - 1) * 0.025, -(count - 1) * 0.032 - 0.016);
    b.rotation.set(0, Math.PI, -(count - 1 - 1) * 0.018);
    root.add(f, b);
    return root;
  }

  if (config.serviceId === 'a4-calendar') {
    const w = config.sizeId === 'a3' ? 2.05 : 1.85;
    const h = config.sizeId === 'a3' ? 2.65 : 2.45;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.055),
      new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.35 }),
    );
    board.castShadow = true;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), frontMat);
    f.position.z = 0.031;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), backMat);
    b.position.z = -0.031;
    b.rotation.y = Math.PI;
    root.add(board, f, b);

    const wireMat = new THREE.MeshStandardMaterial({ color: 0xcbd2da, metalness: 0.9, roughness: 0.2 });
    const cols = 10;
    for (let i = 0; i < cols; i += 1) {
      const rx = -w / 2 + 0.16 + (i / (cols - 1)) * (w - 0.32);
      if (Math.abs(rx) < 0.2) continue;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 10, 22), wireMat);
      coil.position.set(rx, h / 2 + 0.01, 0);
      coil.rotation.y = Math.PI / 2;
      root.add(coil);
    }
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 12, 28, Math.PI), wireMat);
    hanger.position.set(0, h / 2 + 0.01, 0);
    root.add(hanger);
    return root;
  }

  // souvenir-making (3D Gold Medallion OR Keepsake Favor Box)
  if (config.sizeId === 'box') {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.75, 1.55, 1.75),
      new THREE.MeshStandardMaterial({ color: 0xfbfbfb, roughness: 0.4 }),
    );
    box.castShadow = true;
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(1.86, 0.36, 1.86),
      new THREE.MeshStandardMaterial({ color: 0x8fe515, roughness: 0.32 }),
    );
    lid.position.y = 0.85;
    lid.castShadow = true;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.42), frontMat);
    f.position.z = 0.885;
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.62, 1.42), backMat);
    b.position.z = -0.885;
    b.rotation.y = Math.PI;
    root.add(box, lid, f, b);
    return root;
  }

  // 3D Medallion
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xd8b14c, metalness: 0.86, roughness: 0.24 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.14, 56), goldMat);
  coin.rotation.x = Math.PI / 2;
  coin.castShadow = true;
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.06, 18, 56), goldMat);
  const f = new THREE.Mesh(new THREE.CircleGeometry(0.89, 56), frontMat);
  f.position.z = 0.075;
  const b = new THREE.Mesh(new THREE.CircleGeometry(0.89, 56), backMat);
  b.position.z = -0.075;
  b.rotation.y = Math.PI;
  const ribbonMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
  const leftStrap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.25, 0.03), ribbonMat);
  leftStrap.position.set(-0.28, 1.38, 0);
  leftStrap.rotation.z = -0.22;
  const rightStrap = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.25, 0.03), ribbonMat);
  rightStrap.position.set(0.28, 1.38, 0);
  rightStrap.rotation.z = 0.22;
  root.add(coin, bezel, f, b, leftStrap, rightStrap);
  root.position.y = -0.35;
  return root;
}

export const Studio3DCanvas = forwardRef<Studio3DCanvasHandle, Studio3DCanvasProps>(
  function Studio3DCanvas({ config, viewTarget, viewNonce, onSideChange }, ref) {
    const mountRef = useRef<HTMLDivElement>(null);
    const [webglReady] = useState(() => canUseWebGL());

    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const productRootRef = useRef<THREE.Group>(new THREE.Group());
    const frontMatRef = useRef<THREE.MeshStandardMaterial>(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34 }),
    );
    const backMatRef = useRef<THREE.MeshStandardMaterial>(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.34 }),
    );
    const frontTexRef = useRef<THREE.CanvasTexture | null>(null);
    const backTexRef = useRef<THREE.CanvasTexture | null>(null);

    const rotState = useRef({
      dragging: false,
      startX: 0,
      startY: 0,
      startRotY: -0.24,
      startRotX: 0.1,
      targetY: -0.24,
      targetX: 0.1,
      curY: -0.24,
      curX: 0.1,
      lastBack: false,
    });

    useImperativeHandle(ref, () => ({
      captureSnapshot: () => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        if (!renderer || !scene || !camera) return undefined;
        try {
          renderer.render(scene, camera);
          return renderer.domElement.toDataURL('image/jpeg', 0.9);
        } catch {
          return undefined;
        }
      },
    }));

    // Initialize Three.js WebGL context, studio lighting & animation loop once
    useEffect(() => {
      if (!webglReady || !mountRef.current) return;
      const container = mountRef.current;
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
        });
      } catch {
        return;
      }

      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 40);
      camera.position.set(0, 0.15, 6.2);

      const hemi = new THREE.HemisphereLight(0xffffff, 0xe8edf3, 1.35);
      const keyLight = new THREE.DirectionalLight(0xfffdf8, 1.55);
      keyLight.position.set(3.5, 5.2, 4.8);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.radius = 4;
      const fillLight = new THREE.DirectionalLight(0xebf3ff, 0.72);
      fillLight.position.set(-4.2, 1.5, 3.2);
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.85);
      rimLight.position.set(0, 3.0, -5.0);

      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.ShadowMaterial({ opacity: 0.12 }),
      );
      shadowPlane.rotation.x = -Math.PI / 2;
      shadowPlane.position.y = -1.68;
      shadowPlane.receiveShadow = true;

      scene.add(hemi, keyLight, fillLight, rimLight, shadowPlane, productRootRef.current);

      renderer.domElement.className = 'h-full w-full block';
      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      rendererRef.current = renderer;
      sceneRef.current = scene;
      cameraRef.current = camera;

      const syncSize = () => {
        const w = Math.max(300, container.clientWidth);
        const h = Math.max(300, container.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      syncSize();

      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncSize) : null;
      ro?.observe(container);

      let raf = 0;
      const animate = () => {
        const st = rotState.current;
        st.curY += (st.targetY - st.curY) * 0.14;
        st.curX += (st.targetX - st.curX) * 0.14;
        productRootRef.current.rotation.y = st.curY;
        productRootRef.current.rotation.x = st.curX;

        const deg = (((st.curY * 180) / Math.PI) % 360 + 360) % 360;
        const backNow = deg > 90 && deg < 270;
        if (backNow !== st.lastBack) {
          st.lastBack = backNow;
          onSideChange?.(backNow);
        }

        renderer.render(scene, camera);
        raf = window.requestAnimationFrame(animate);
      };
      raf = window.requestAnimationFrame(animate);

      const groupToDispose = productRootRef.current;
      const frontMatToDispose = frontMatRef.current;
      const backMatToDispose = backMatRef.current;
      return () => {
        window.cancelAnimationFrame(raf);
        ro?.disconnect();
        disposeGroup(groupToDispose);
        frontTexRef.current?.dispose();
        backTexRef.current?.dispose();
        frontMatToDispose.dispose();
        backMatToDispose.dispose();
        renderer.dispose();
        rendererRef.current = null;
      };
    }, [webglReady, onSideChange]);

    // Sync view presets (Front / Back / Reset)
    useEffect(() => {
      const st = rotState.current;
      if (viewTarget === 'front') {
        st.targetY = 0;
        st.targetX = 0;
      } else if (viewTarget === 'back') {
        st.targetY = Math.PI;
        st.targetX = 0;
      } else {
        st.targetY = -0.24;
        st.targetX = 0.1;
      }
    }, [viewTarget, viewNonce]);

    // Rebuild 3D geometry only when service, size, or finish changes
    useEffect(() => {
      if (!webglReady) return;
      const root = productRootRef.current;
      disposeGroup(root);
      frontMatRef.current.roughness = config.laminationFinish === 'Glossy' ? 0.22 : 0.62;
      backMatRef.current.roughness = config.laminationFinish === 'Glossy' ? 0.22 : 0.62;
      const mesh = buildMeshForService(config, frontMatRef.current, backMatRef.current);
      root.add(mesh);
    }, [webglReady, config.serviceId, config.sizeId, config.laminationFinish]);

    // Live-update procedural canvas textures on slider/text/photo changes without rebuilding mesh
    useEffect(() => {
      if (!webglReady) return;
      let cancelled = false;

      buildProductTextures(config).then((texSet) => {
        if (cancelled || !texSet) return;
        const applyTex = (
          canvas: HTMLCanvasElement,
          refObj: { current: THREE.CanvasTexture | null },
          mat: THREE.MeshStandardMaterial,
        ) => {
          refObj.current?.dispose();
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          tex.needsUpdate = true;
          refObj.current = tex;
          mat.map = tex;
          mat.needsUpdate = true;
        };

        applyTex(texSet.front, frontTexRef, frontMatRef.current);
        applyTex(texSet.back, backTexRef, backMatRef.current);
      });

      return () => {
        cancelled = true;
      };
    }, [webglReady, config]);

    const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
      rotState.current.dragging = true;
      rotState.current.startX = e.clientX;
      rotState.current.startY = e.clientY;
      rotState.current.startRotY = rotState.current.targetY;
      rotState.current.startRotX = rotState.current.targetX;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
      const st = rotState.current;
      if (!st.dragging) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      st.targetY = st.startRotY + dx * 0.011;
      st.targetX = Math.max(-0.75, Math.min(0.75, st.startRotX + dy * 0.008));
    };

    const onPointerUp = () => {
      rotState.current.dragging = false;
    };

    if (!webglReady) {
      return (
        <div
          data-testid="studio-3d-fallback"
          className="flex h-full min-h-[22rem] w-full flex-col items-center justify-center rounded-xl bg-white p-6 text-center"
        >
          {config.artworkSrc && (
            <img
              src={config.artworkSrc}
              alt={config.serviceId}
              className="max-h-56 rounded-lg object-contain"
            />
          )}
          {config.customText.trim() && (
            <p
              style={{
                fontFamily: config.fontStyle,
                fontSize: `${config.textSize}px`,
                writingMode: config.textOrientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
              }}
              className="mt-3 font-bold text-[#151515]"
            >
              {config.customText}
            </p>
          )}
        </div>
      );
    }

    return (
      <div
        ref={mountRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="h-full min-h-[23rem] sm:min-h-[27rem] lg:min-h-[30rem] w-full cursor-grab select-none active:cursor-grabbing"
      />
    );
  },
);
