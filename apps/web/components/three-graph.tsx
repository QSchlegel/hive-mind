"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type GraphPayload = {
  nodes: Array<{ id: string; label: string; xp: number }>;
  edges: Array<{ source: string; target: string; type: string }>;
};

function seededGraph(): GraphPayload {
  return {
    nodes: [
      { id: "hive-mind", label: "hive-mind", xp: 9800 },
      { id: "hive-memory", label: "hive-memory", xp: 4200 },
      { id: "knowledge-graph", label: "knowledge-graph", xp: 3800 },
      { id: "economic-shields", label: "economic-shields", xp: 3600 },
      { id: "consensus-protocol", label: "consensus-protocol", xp: 3200 },
      { id: "token-economics", label: "token-economics", xp: 2900 },
      { id: "wallet-signing", label: "wallet-signing", xp: 2800 },
      { id: "decentralized-auth", label: "decentralized-auth", xp: 2600 },
      { id: "bot-reputation", label: "bot-reputation", xp: 2200 },
      { id: "endorsement-system", label: "endorsement-system", xp: 2100 },
      { id: "micro-payments", label: "micro-payments", xp: 2000 },
      { id: "ipfs-mirror", label: "ipfs-mirror", xp: 1900 },
      { id: "xp-distribution", label: "xp-distribution", xp: 1800 },
      { id: "api-gateway", label: "api-gateway", xp: 1700 },
      { id: "content-moderation", label: "content-moderation", xp: 1600 },
      { id: "git-provenance", label: "git-provenance", xp: 1500 },
      { id: "tag-governance", label: "tag-governance", xp: 1400 },
      { id: "spam-prevention", label: "spam-prevention", xp: 1200 },
      { id: "tag-security", label: "tag-security", xp: 950 },
      { id: "invite-system", label: "invite-system", xp: 800 },
      { id: "nonce-registry", label: "nonce-registry", xp: 720 },
      { id: "rate-limiting", label: "rate-limiting", xp: 680 },
    ],
    edges: [
      { source: "hive-mind", target: "hive-memory", type: "wiki_link" },
      { source: "hive-mind", target: "consensus-protocol", type: "wiki_link" },
      { source: "hive-mind", target: "economic-shields", type: "wiki_link" },
      { source: "hive-mind", target: "knowledge-graph", type: "wiki_link" },
      { source: "hive-mind", target: "api-gateway", type: "wiki_link" },
      { source: "knowledge-graph", target: "hive-memory", type: "wiki_link" },
      { source: "knowledge-graph", target: "tag-governance", type: "wiki_link" },
      { source: "knowledge-graph", target: "consensus-protocol", type: "wiki_link" },
      { source: "economic-shields", target: "micro-payments", type: "wiki_link" },
      { source: "economic-shields", target: "token-economics", type: "wiki_link" },
      { source: "economic-shields", target: "xp-distribution", type: "wiki_link" },
      { source: "economic-shields", target: "endorsement-system", type: "wiki_link" },
      { source: "token-economics", target: "xp-distribution", type: "wiki_link" },
      { source: "token-economics", target: "bot-reputation", type: "wiki_link" },
      { source: "micro-payments", target: "wallet-signing", type: "wiki_link" },
      { source: "wallet-signing", target: "decentralized-auth", type: "wiki_link" },
      { source: "wallet-signing", target: "bot-reputation", type: "wiki_link" },
      { source: "wallet-signing", target: "nonce-registry", type: "wiki_link" },
      { source: "decentralized-auth", target: "invite-system", type: "wiki_link" },
      { source: "decentralized-auth", target: "nonce-registry", type: "wiki_link" },
      { source: "hive-memory", target: "content-moderation", type: "wiki_link" },
      { source: "hive-memory", target: "ipfs-mirror", type: "wiki_link" },
      { source: "hive-memory", target: "git-provenance", type: "wiki_link" },
      { source: "content-moderation", target: "spam-prevention", type: "wiki_link" },
      { source: "content-moderation", target: "bot-reputation", type: "wiki_link" },
      { source: "content-moderation", target: "rate-limiting", type: "wiki_link" },
      { source: "ipfs-mirror", target: "git-provenance", type: "wiki_link" },
      { source: "consensus-protocol", target: "bot-reputation", type: "wiki_link" },
      { source: "api-gateway", target: "wallet-signing", type: "wiki_link" },
      { source: "api-gateway", target: "rate-limiting", type: "wiki_link" },
      { source: "endorsement-system", target: "bot-reputation", type: "wiki_link" },
      { source: "tag-governance", target: "tag-security", type: "tag" },
      { source: "hive-memory", target: "tag-governance", type: "tag" },
      { source: "spam-prevention", target: "rate-limiting", type: "wiki_link" },
    ],
  };
}

// ── Theme palettes ──────────────────────────────────────────────────────────

interface ThemePalette {
  bg: number;
  fogColor: number;
  fogDensity: number;
  nodeColors: [number, number, number, number, number];
  nodeCoreOpacity: number;
  glowInnerOpacity: number;
  glowOuterOpacity: number;
  glowBlending: THREE.Blending;
  edgeWiki: number;
  edgeTag: number;
  edgeOpacityBright: number;
  edgeOpacityDim: number;
  edgeBlending: THREE.Blending;
  travelerColor: number;
  travelerOpacity: number;
  travelerSize: number;
  starColor: number;
  starSize: number;
  starOpacity: number;
  nebulaColors: [number, number, number];
  nebulaOpacity: number;
  nebulaBlending: THREE.Blending;
  coreDustColor: number;
  coreDustSize: number;
  coreDustOpacity: number;
  ambientNodeColor: number;
  ambientNodeOpacity: number;
  ambientGlowOpacity: number;
  ambientEdgeColor: number;
  ambientEdgeOpacity: number;
}

const DARK: ThemePalette = {
  bg: 0x0f1114,
  fogColor: 0x0f1114,
  fogDensity: 0.00105,
  nodeColors: [0xffe1ba, 0xffc27a, 0xf19a34, 0xcd762a, 0x8e7562],
  nodeCoreOpacity: 0.94,
  glowInnerOpacity: 0.14,
  glowOuterOpacity: 0.05,
  glowBlending: THREE.AdditiveBlending,
  edgeWiki: 0x718092,
  edgeTag: 0xf3a03a,
  edgeOpacityBright: 0.30,
  edgeOpacityDim: 0.05,
  edgeBlending: THREE.AdditiveBlending,
  travelerColor: 0xffc174,
  travelerOpacity: 0.72,
  travelerSize: 3.1,
  starColor: 0x697586,
  starSize: 1.0,
  starOpacity: 0.16,
  nebulaColors: [0x3f2b1a, 0x232a33, 0x1a1e24],
  nebulaOpacity: 0.04,
  nebulaBlending: THREE.AdditiveBlending,
  coreDustColor: 0xc58134,
  coreDustSize: 18,
  coreDustOpacity: 0.11,
  ambientNodeColor: 0xffcb8b,
  ambientNodeOpacity: 0.72,
  ambientGlowOpacity: 0.14,
  ambientEdgeColor: 0xd3964b,
  ambientEdgeOpacity: 0.22,
};

const LIGHT: ThemePalette = {
  bg: 0xebe3d7,
  fogColor: 0xebe3d7,
  fogDensity: 0.00033,
  nodeColors: [0x5a3c1d, 0x8b5823, 0xc77726, 0xe0902f, 0xf0ba74],
  nodeCoreOpacity: 0.95,
  glowInnerOpacity: 0.14,
  glowOuterOpacity: 0.06,
  glowBlending: THREE.NormalBlending,
  edgeWiki: 0x464c57,
  edgeTag: 0xc77726,
  edgeOpacityBright: 0.44,
  edgeOpacityDim: 0.16,
  edgeBlending: THREE.NormalBlending,
  travelerColor: 0xc77726,
  travelerOpacity: 0.72,
  travelerSize: 3.2,
  starColor: 0x9d8f7e,
  starSize: 0.95,
  starOpacity: 0.16,
  nebulaColors: [0xd7b183, 0xb4afa6, 0xe3ccab],
  nebulaOpacity: 0.08,
  nebulaBlending: THREE.NormalBlending,
  coreDustColor: 0xc78b4d,
  coreDustSize: 14,
  coreDustOpacity: 0.06,
  ambientNodeColor: 0xa06733,
  ambientNodeOpacity: 0.68,
  ambientGlowOpacity: 0.1,
  ambientEdgeColor: 0xb0753c,
  ambientEdgeOpacity: 0.2,
};

export function ThreeGraph() {
  const mountRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [payload, setPayload] = useState<GraphPayload>(seededGraph());
  const [isDark, setIsDark] = useState(true);

  // ── Track theme changes ────────────────────────────────────────────────────
  useEffect(() => {
    const update = () =>
      setIsDark(document.documentElement.dataset.theme !== "light");
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  // ── Live data (only update when graph shape actually changes to avoid scene thrash) ──
  useEffect(() => {
    let active = true;
    const payloadSignature = (data: GraphPayload) =>
      `${data.nodes?.length ?? 0}-${data.nodes?.[0]?.id ?? ""}-${data.nodes?.[data.nodes.length - 1]?.id ?? ""}`;

    const pull = () => {
      fetch("/api/graph", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as GraphPayload;
          if (!active || !data.nodes?.length) return;
          const nextSig = payloadSignature(data);
          setPayload((prev) => (payloadSignature(prev) === nextSig ? prev : data));
        })
        .catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  // ── Three.js scene ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    cleanupRef.current?.();
    cleanupRef.current = null;

    const pal = isDark ? DARK : LIGHT;

    let animId = 0;
    // Avoid NaN aspect when container isn't laid out yet; resize handler will correct
    const W = Math.max(1, mount.clientWidth || window.innerWidth);
    const H = Math.max(1, mount.clientHeight || window.innerHeight);

    // ── Scene ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(pal.fogColor, pal.fogDensity);

    // ── Camera ────────────────────────────────────────
    const aspect = Math.max(0.1, Math.min(10, W / H));
    const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 2000);
    camera.position.set(0, 0, 400);

    // ── Renderer ──────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    const isMobile = window.innerWidth < 768 || "ontouchstart" in window;
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
    renderer.setClearColor(pal.bg, 1);
    renderer.domElement.style.display = "block";
    mount.style.position = "relative";
    mount.appendChild(renderer.domElement);

    // ── Graph group ───────────────────────────────────
    const graphGroup = new THREE.Group();
    scene.add(graphGroup);

    // ── Fibonacci sphere node layout ──────────────────
    const nodePositions = new Map<string, THREE.Vector3>();
    const golden = (1 + Math.sqrt(5)) / 2;
    const spread = 155;
    payload.nodes.forEach((node, i) => {
      const theta = Math.acos(1 - (2 * (i + 0.5)) / payload.nodes.length);
      const phi = (2 * Math.PI * i) / golden;
      nodePositions.set(
        node.id,
        new THREE.Vector3(
          spread * Math.sin(theta) * Math.cos(phi),
          spread * Math.sin(theta) * Math.sin(phi),
          spread * Math.cos(theta)
        )
      );
    });

    // ── Node color by XP ──────────────────────────────
    const [c0, c1, c2, c3, c4] = pal.nodeColors;
    const nodeColor = (xp: number): number => {
      if (xp > 6000) return c0;
      if (xp > 3000) return c1;
      if (xp > 2000) return c2;
      if (xp > 1300) return c3;
      return c4;
    };

    // ── Build nodes ───────────────────────────────────
    interface NodeEntry {
      core: THREE.Mesh;
      inner: THREE.Mesh;
      outer: THREE.Mesh;
      coreMat: THREE.MeshBasicMaterial;
      innerMat: THREE.MeshBasicMaterial;
      outerMat: THREE.MeshBasicMaterial;
      phase: number;
      currentScale: number;
      targetScale: number;
      label: string;
      xpVal: number;
    }

    const nodeEntries: NodeEntry[] = [];
    const meshToIdx = new Map<THREE.Mesh, number>();
    const nodeIdToIdx = new Map<string, number>();
    payload.nodes.forEach((n, i) => nodeIdToIdx.set(n.id, i));

    payload.nodes.forEach((node, i) => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;
      const color = nodeColor(node.xp);
      const r = 2.5 + Math.min(node.xp / 700, 8.5);

      const coreMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: pal.nodeCoreOpacity });
      const core = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 20), coreMat);
      core.position.copy(pos);
      graphGroup.add(core);

      const innerMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: pal.glowInnerOpacity,
        blending: pal.glowBlending, depthWrite: false, side: THREE.BackSide,
      });
      const inner = new THREE.Mesh(new THREE.SphereGeometry(r * 2.8, 12, 12), innerMat);
      inner.position.copy(pos);
      graphGroup.add(inner);

      const outerMat = new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: pal.glowOuterOpacity,
        blending: pal.glowBlending, depthWrite: false, side: THREE.BackSide,
      });
      const outer = new THREE.Mesh(new THREE.SphereGeometry(r * 6, 12, 12), outerMat);
      outer.position.copy(pos);
      graphGroup.add(outer);

      // Invisible hitbox (3× radius) for generous hover detection
      const hitbox = new THREE.Mesh(
        new THREE.SphereGeometry(r * 3, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitbox.position.copy(pos);
      graphGroup.add(hitbox);
      meshToIdx.set(hitbox, i);

      nodeEntries.push({
        core, inner, outer, coreMat, innerMat, outerMat,
        phase: i * 0.74, currentScale: 1, targetScale: 1,
        label: node.label, xpVal: node.xp,
      });
    });

    // ── Build edges ───────────────────────────────────
    interface EdgeEntry {
      src: THREE.Vector3;
      tgt: THREE.Vector3;
      srcIdx: number;
      tgtIdx: number;
      dimMat: THREE.LineBasicMaterial;
      brightMat: THREE.LineBasicMaterial;
    }
    const edgeEntries: EdgeEntry[] = [];
    const hitboxMeshes = [...meshToIdx.keys()];

    payload.edges.forEach((edge) => {
      const src = nodePositions.get(edge.source);
      const tgt = nodePositions.get(edge.target);
      if (!src || !tgt) return;

      const srcIdx = nodeIdToIdx.get(edge.source) ?? -1;
      const tgtIdx = nodeIdToIdx.get(edge.target) ?? -1;
      const edgeColor = edge.type === "wiki_link" ? pal.edgeWiki : pal.edgeTag;

      const dimMat = new THREE.LineBasicMaterial({
        color: edgeColor, transparent: true, opacity: pal.edgeOpacityDim,
        blending: pal.edgeBlending, depthWrite: false,
      });
      const brightMat = new THREE.LineBasicMaterial({
        color: edgeColor, transparent: true, opacity: pal.edgeOpacityBright,
        blending: pal.edgeBlending, depthWrite: false,
      });

      graphGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([src, tgt]), dimMat));
      graphGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([src, tgt]), brightMat));
      edgeEntries.push({ src, tgt, srcIdx, tgtIdx, dimMat, brightMat });
    });

    // ── Ambient orbital swarm (extra connected, swirling nodes) ──────────
    interface AmbientNodeEntry {
      core: THREE.Mesh;
      glow: THREE.Mesh;
      coreMat: THREE.MeshBasicMaterial;
      glowMat: THREE.MeshBasicMaterial;
      anchor: THREE.Vector3;
      tangentA: THREE.Vector3;
      tangentB: THREE.Vector3;
      orbitRadius: number;
      orbitSpeed: number;
      phase: number;
      pulsePhase: number;
      linkedPrimaryIdx: number;
      linkMat: THREE.LineBasicMaterial;
      linkGeo: THREE.BufferGeometry;
      linkPos: Float32Array;
      linkBaseOpacity: number;
    }

    interface AmbientEdgeLink {
      a: number;
      b: number;
      mat: THREE.LineBasicMaterial;
      geo: THREE.BufferGeometry;
      pos: Float32Array;
      baseOpacity: number;
    }

    const ambientEntries: AmbientNodeEntry[] = [];
    const ambientLinks: AmbientEdgeLink[] = [];
    const ambientCount = isMobile ? 20 : 52;
    const ambientShell = isDark ? 212 : 204;

    for (let i = 0; i < ambientCount; i++) {
      const theta = Math.acos(1 - (2 * (i + 0.5)) / ambientCount);
      const phi = (2 * Math.PI * i) / golden + (Math.random() - 0.5) * 0.26;
      const radiusJitter = 1 + (Math.random() - 0.5) * 0.18;
      const anchor = new THREE.Vector3(
        ambientShell * radiusJitter * Math.sin(theta) * Math.cos(phi),
        ambientShell * radiusJitter * Math.sin(theta) * Math.sin(phi),
        ambientShell * radiusJitter * Math.cos(theta)
      );

      const axis = anchor.clone().normalize();
      const ref = Math.abs(axis.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const tangentA = new THREE.Vector3().crossVectors(axis, ref).normalize();
      const tangentB = new THREE.Vector3().crossVectors(axis, tangentA).normalize();

      let linkedPrimaryIdx = 0;
      let nearestDist = Number.POSITIVE_INFINITY;
      nodeEntries.forEach((entry, idx) => {
        const d = anchor.distanceToSquared(entry.core.position);
        if (d < nearestDist) {
          nearestDist = d;
          linkedPrimaryIdx = idx;
        }
      });

      const linkedPrimaryPos = nodeEntries[linkedPrimaryIdx]?.core.position;
      if (!linkedPrimaryPos) {
        continue;
      }

      const r = 0.85 + Math.random() * 1.35;
      const coreMat = new THREE.MeshBasicMaterial({
        color: pal.ambientNodeColor,
        transparent: true,
        opacity: pal.ambientNodeOpacity,
      });
      const core = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 12), coreMat);
      core.position.copy(anchor);
      graphGroup.add(core);

      const glowMat = new THREE.MeshBasicMaterial({
        color: pal.ambientNodeColor,
        transparent: true,
        opacity: pal.ambientGlowOpacity,
        blending: pal.glowBlending,
        depthWrite: false,
        side: THREE.BackSide,
      });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(r * 2.4, 10, 10), glowMat);
      glow.position.copy(anchor);
      graphGroup.add(glow);

      const linkBaseOpacity = pal.ambientEdgeOpacity * (0.82 + Math.random() * 0.45);
      const linkPos = new Float32Array([
        anchor.x, anchor.y, anchor.z,
        linkedPrimaryPos.x, linkedPrimaryPos.y, linkedPrimaryPos.z
      ]);
      const linkGeo = new THREE.BufferGeometry();
      linkGeo.setAttribute("position", new THREE.BufferAttribute(linkPos, 3));
      const linkMat = new THREE.LineBasicMaterial({
        color: pal.ambientEdgeColor,
        transparent: true,
        opacity: linkBaseOpacity,
        blending: pal.edgeBlending,
        depthWrite: false,
      });
      graphGroup.add(new THREE.Line(linkGeo, linkMat));

      ambientEntries.push({
        core,
        glow,
        coreMat,
        glowMat,
        anchor,
        tangentA,
        tangentB,
        orbitRadius: 7 + Math.random() * 15,
        orbitSpeed: 0.42 + Math.random() * 0.9,
        phase: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2,
        linkedPrimaryIdx,
        linkMat,
        linkGeo,
        linkPos,
        linkBaseOpacity,
      });
    }

    const createAmbientLink = (a: number, b: number, baseOpacity: number) => {
      const pa = ambientEntries[a]?.core.position;
      const pb = ambientEntries[b]?.core.position;
      if (!pa || !pb) return;

      const pos = new Float32Array([
        pa.x, pa.y, pa.z,
        pb.x, pb.y, pb.z
      ]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: pal.ambientEdgeColor,
        transparent: true,
        opacity: baseOpacity,
        blending: pal.edgeBlending,
        depthWrite: false,
      });
      graphGroup.add(new THREE.Line(geo, mat));
      ambientLinks.push({ a, b, mat, geo, pos, baseOpacity });
    };

    const skip = Math.max(4, Math.round(ambientEntries.length / 10));
    ambientEntries.forEach((_, i) => {
      createAmbientLink(i, (i + 1) % ambientEntries.length, pal.ambientEdgeOpacity * 0.64);
      if (i % 2 === 0) {
        createAmbientLink(i, (i + skip) % ambientEntries.length, pal.ambientEdgeOpacity * 0.48);
      }
    });

    // ── Traveling edge particles ───────────────────────
    const travCount = edgeEntries.length;
    const travPos = new Float32Array(travCount * 3);
    const travProgress = edgeEntries.map(() => Math.random());
    const travSpeed = edgeEntries.map(() =>
      (isDark ? 0.0022 : 0.003) + Math.random() * (isDark ? 0.0038 : 0.006)
    );
    const travGeo = new THREE.BufferGeometry();
    travGeo.setAttribute("position", new THREE.BufferAttribute(travPos, 3));
    graphGroup.add(
      new THREE.Points(
        travGeo,
        new THREE.PointsMaterial({
          color: pal.travelerColor, size: pal.travelerSize,
          transparent: true, opacity: pal.travelerOpacity,
          blending: pal.edgeBlending, depthWrite: false, sizeAttenuation: true,
        })
      )
    );

    // ── Starfield ──────────────────────────────────────
    const starCount = isMobile ? (isDark ? 420 : 700) : (isDark ? 1500 : 2200);
    const starSpread = isDark ? 2400 : 3000;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * starSpread;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * starSpread;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * starSpread;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: pal.starColor, size: pal.starSize,
          transparent: true, opacity: pal.starOpacity,
          blending: pal.edgeBlending, depthWrite: false, sizeAttenuation: true,
        })
      )
    );

    // ── Atmospheric clouds ─────────────────────────────
    const nebulaCount = isMobile ? (isDark ? 32 : 50) : (isDark ? 110 : 160);
    const nebulaSpread = isDark ? 560 : 700;
    pal.nebulaColors.forEach((color, layer) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(nebulaCount * 3);
      for (let i = 0; i < nebulaCount; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * nebulaSpread;
        pos[i * 3 + 1] = (Math.random() - 0.5) * nebulaSpread;
        pos[i * 3 + 2] = (Math.random() - 0.5) * nebulaSpread;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color, size: 22 + layer * 8,
            transparent: true, opacity: pal.nebulaOpacity,
            blending: pal.nebulaBlending, depthWrite: false, sizeAttenuation: true,
          })
        )
      );
    });

    // ── Core ember haze to anchor the graph in dark mode ──────────────
    const coreDustCount = isMobile ? 90 : 260;
    const coreDustPos = new Float32Array(coreDustCount * 3);
    const coreDustRadius = isDark ? 250 : 210;
    for (let i = 0; i < coreDustCount; i++) {
      const r = Math.pow(Math.random(), 0.66) * coreDustRadius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      coreDustPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      coreDustPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      coreDustPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const coreDustGeo = new THREE.BufferGeometry();
    coreDustGeo.setAttribute("position", new THREE.BufferAttribute(coreDustPos, 3));
    scene.add(
      new THREE.Points(
        coreDustGeo,
        new THREE.PointsMaterial({
          color: pal.coreDustColor,
          size: pal.coreDustSize,
          transparent: true,
          opacity: pal.coreDustOpacity,
          blending: pal.nebulaBlending,
          depthWrite: false,
          sizeAttenuation: true,
        })
      )
    );

    // ── Tooltip DOM element ────────────────────────────
    const tooltipEl  = document.createElement("div");
    const tipLabel   = document.createElement("span");
    const tipXP      = document.createElement("span");
    tooltipEl.className  = "graph-tooltip";
    tipLabel.className   = "graph-tooltip-label";
    tipXP.className      = "graph-tooltip-xp";
    tooltipEl.appendChild(tipLabel);
    tooltipEl.appendChild(tipXP);
    tooltipEl.style.display = "none";
    mount.appendChild(tooltipEl);

    // ── Mouse + hover state ────────────────────────────
    const mouseNDC      = new THREE.Vector2(0, 0);
    const mouseParallax = new THREE.Vector2(0, 0);
    const raycaster       = new THREE.Raycaster();
    let hoveredIdx        = -1;
    let hoverClearFrames  = 0;
    const HOVER_CLEAR_DELAY = 6;
    let touchClearTimer: ReturnType<typeof setTimeout> | null = null;

    const ndcFromClient = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseNDC.x =  ((clientX - rect.left) / rect.width)  * 2 - 1;
      mouseNDC.y = -((clientY - rect.top)  / rect.height) * 2 + 1;
    };

    const onMouseMove  = (e: MouseEvent) => ndcFromClient(e.clientX, e.clientY);
    const onMouseLeave = () => mouseNDC.set(0, 0);

    // Touch: tap/drag to highlight nodes; tooltip auto-clears after 1.8 s
    const onTouchStart = (e: TouchEvent) => {
      if (touchClearTimer !== null) clearTimeout(touchClearTimer);
      const t = e.touches[0];
      if (t) ndcFromClient(t.clientX, t.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) ndcFromClient(t.clientX, t.clientY);
    };
    const onTouchEnd = () => {
      touchClearTimer = setTimeout(() => mouseNDC.set(0, 0), 1800);
    };

    mount.addEventListener("mousemove",  onMouseMove);
    mount.addEventListener("mouseleave", onMouseLeave);
    mount.addEventListener("touchstart", onTouchStart, { passive: true });
    mount.addEventListener("touchmove",  onTouchMove,  { passive: true });
    mount.addEventListener("touchend",   onTouchEnd);

    // ── Animation loop ────────────────────────────────
    const tmp = new THREE.Vector3();
    const tooltipWorldPos = new THREE.Vector3();
    const tooltipNdc = new THREE.Vector3();
    let t = 0;
    let orbitAngle = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.004;

      const orbitSpeed = isDark ? 0.052 : 0.065;
      const bobAmplitude = isDark ? 72 : 100;
      const parallaxXScale = isDark ? 42 : 50;
      const parallaxYScale = isDark ? 24 : 30;
      const graphSpin = isDark ? 0.018 : 0.022;
      const graphTilt = isDark ? 0.11 : 0.14;
      const pulseAmplitude = isDark ? 0.06 : 0.08;
      const pulseSpeed = isDark ? 1.18 : 1.4;

      // Mouse parallax — desktop only; zero when a node is hovered so the graph doesn't move under the cursor
      if (!isMobile) {
        if (hoveredIdx >= 0) {
          mouseParallax.x += (0 - mouseParallax.x) * 0.04;
          mouseParallax.y += (0 - mouseParallax.y) * 0.04;
        } else {
          mouseParallax.x += (mouseNDC.x * parallaxXScale - mouseParallax.x) * 0.04;
          mouseParallax.y += (-mouseNDC.y * parallaxYScale - mouseParallax.y) * 0.04;
        }
      }

      // Camera orbit + parallax nudge; orbit slows when a node is hovered so the graph doesn't rotate away
      const orbitSpeedMult = hoveredIdx >= 0 ? 0.35 : 1;
      orbitAngle += 0.004 * orbitSpeed * orbitSpeedMult;
      camera.position.x = Math.sin(orbitAngle) * 400 + mouseParallax.x;
      camera.position.z = Math.cos(orbitAngle) * 400;
      camera.position.y = Math.sin(t * 0.022) * bobAmplitude + mouseParallax.y;
      camera.lookAt(0, 0, 0);

      // Graph tilts gently
      graphGroup.rotation.y = t * graphSpin;
      graphGroup.rotation.x = Math.sin(t * 0.013) * graphTilt;

      // ── Raycasting + hover-off hysteresis (avoid flicker when ray grazes hitbox edge)
      raycaster.setFromCamera(mouseNDC, camera);
      const hits = raycaster.intersectObjects(hitboxMeshes);
      const newHovered = hits.length > 0
        ? (meshToIdx.get(hits[0].object as THREE.Mesh) ?? -1)
        : -1;

      if (newHovered >= 0) {
        hoveredIdx = newHovered;
        hoverClearFrames = 0;
        mount.style.cursor = "pointer";
      } else {
        hoverClearFrames += 1;
        if (hoverClearFrames >= HOVER_CLEAR_DELAY) {
          hoveredIdx = -1;
          mount.style.cursor = "";
          tooltipEl.style.display = "none";
        }
      }

      const anyHov = hoveredIdx >= 0;

      // ── Node scale + glow ────────────────────────────
      nodeEntries.forEach((entry, i) => {
        const isHov = i === hoveredIdx;

        // Hovered node grows, background nodes recede
        entry.targetScale = !anyHov ? 1 : isHov ? 1.85 : 0.88;
        entry.currentScale += (entry.targetScale - entry.currentScale) * 0.15;

        // Glow blazes on hover
        entry.innerMat.opacity = isHov
          ? Math.min(pal.glowInnerOpacity * 4.5, 0.85)
          : pal.glowInnerOpacity;
        entry.outerMat.opacity = isHov
          ? Math.min(pal.glowOuterOpacity * 6, 0.55)
          : pal.glowOuterOpacity;

        // Background nodes dim to focus attention
        entry.coreMat.opacity = anyHov && !isHov
          ? pal.nodeCoreOpacity * (isDark ? 0.62 : 0.50)
          : pal.nodeCoreOpacity;

        // Pulse × hover scale
        const pulse = 1 + Math.sin(t * pulseSpeed + entry.phase) * pulseAmplitude;
        const fs = entry.currentScale * pulse;
        entry.core.scale.setScalar(fs);
        entry.inner.scale.setScalar(fs * 1.2);
        entry.outer.scale.setScalar(fs * 1.4);
      });

      // ── Edge opacity — connected edges blaze, others fade
      edgeEntries.forEach(({ srcIdx, tgtIdx, dimMat, brightMat }) => {
        const connected = anyHov && (srcIdx === hoveredIdx || tgtIdx === hoveredIdx);
        const tBright = connected
          ? Math.min(pal.edgeOpacityBright * 2.8, 0.95)
          : anyHov
          ? pal.edgeOpacityBright * (isDark ? 0.30 : 0.25)
          : pal.edgeOpacityBright;
        const tDim = connected
          ? Math.min(pal.edgeOpacityDim * 4.5, 0.55)
          : anyHov
          ? pal.edgeOpacityDim * (isDark ? 0.38 : 0.30)
          : pal.edgeOpacityDim;
        brightMat.opacity += (tBright - brightMat.opacity) * 0.18;
        dimMat.opacity    += (tDim    - dimMat.opacity)    * 0.18;
      });

      // ── Ambient swirling nodes + connected ambient links ─────────────────
      ambientEntries.forEach((entry) => {
        const angleA = t * entry.orbitSpeed + entry.phase;
        const angleB = angleA * 1.16 + 0.7;
        const offsetA = Math.sin(angleA) * entry.orbitRadius;
        const offsetB = Math.cos(angleB) * entry.orbitRadius * 0.74;
        const px = entry.anchor.x + entry.tangentA.x * offsetA + entry.tangentB.x * offsetB;
        const py = entry.anchor.y + entry.tangentA.y * offsetA + entry.tangentB.y * offsetB;
        const pz = entry.anchor.z + entry.tangentA.z * offsetA + entry.tangentB.z * offsetB;

        entry.core.position.set(px, py, pz);
        entry.glow.position.set(px, py, pz);

        const isLinkedHover = anyHov && entry.linkedPrimaryIdx === hoveredIdx;
        const ambientScale = !anyHov ? 1 : isLinkedHover ? 1.22 : 0.94;
        const ambientPulse = 1 + Math.sin(t * 0.88 + entry.pulsePhase) * 0.08;
        const scale = ambientScale * ambientPulse;
        entry.core.scale.setScalar(scale);
        entry.glow.scale.setScalar(scale * 1.14);

        entry.coreMat.opacity = !anyHov
          ? pal.ambientNodeOpacity
          : isLinkedHover
          ? Math.min(pal.ambientNodeOpacity * 1.2, 0.92)
          : pal.ambientNodeOpacity * 0.58;

        entry.glowMat.opacity = !anyHov
          ? pal.ambientGlowOpacity
          : isLinkedHover
          ? Math.min(pal.ambientGlowOpacity * 1.8, 0.5)
          : pal.ambientGlowOpacity * 0.45;

        const linkedPrimary = nodeEntries[entry.linkedPrimaryIdx]?.core.position;
        if (!linkedPrimary) return;
        entry.linkPos[0] = px;
        entry.linkPos[1] = py;
        entry.linkPos[2] = pz;
        entry.linkPos[3] = linkedPrimary.x;
        entry.linkPos[4] = linkedPrimary.y;
        entry.linkPos[5] = linkedPrimary.z;
        entry.linkGeo.attributes.position.needsUpdate = true;

        const targetOpacity = !anyHov
          ? entry.linkBaseOpacity
          : isLinkedHover
          ? Math.min(entry.linkBaseOpacity * 2.4, 0.62)
          : entry.linkBaseOpacity * 0.34;
        entry.linkMat.opacity += (targetOpacity - entry.linkMat.opacity) * 0.16;
      });

      ambientLinks.forEach((edge) => {
        const aNode = ambientEntries[edge.a];
        const bNode = ambientEntries[edge.b];
        if (!aNode || !bNode) return;

        const ap = aNode.core.position;
        const bp = bNode.core.position;
        edge.pos[0] = ap.x;
        edge.pos[1] = ap.y;
        edge.pos[2] = ap.z;
        edge.pos[3] = bp.x;
        edge.pos[4] = bp.y;
        edge.pos[5] = bp.z;
        edge.geo.attributes.position.needsUpdate = true;

        const edgeConnectedToHover = anyHov && (aNode.linkedPrimaryIdx === hoveredIdx || bNode.linkedPrimaryIdx === hoveredIdx);
        const targetOpacity = !anyHov
          ? edge.baseOpacity
          : edgeConnectedToHover
          ? Math.min(edge.baseOpacity * 2.2, 0.52)
          : edge.baseOpacity * 0.3;
        edge.mat.opacity += (targetOpacity - edge.mat.opacity) * 0.16;
      });

      // ── Tooltip world → screen (clamped to stay in view) ────────────
      if (hoveredIdx >= 0) {
        const entry = nodeEntries[hoveredIdx];
        entry.core.getWorldPosition(tooltipWorldPos);
        tooltipNdc.copy(tooltipWorldPos).project(camera);
        const w = mount.clientWidth  || window.innerWidth;
        const h = mount.clientHeight || window.innerHeight;
        const rawX = (tooltipNdc.x * 0.5 + 0.5) * w;
        const rawY = (-tooltipNdc.y * 0.5 + 0.5) * h;
        // Clamp so tooltip never clips the left/right edge on narrow screens
        const tipW = isMobile ? 160 : 190;
        const clampedX = Math.max(tipW / 2 + 8, Math.min(w - tipW / 2 - 8, rawX));
        const clampedY = Math.max(54, rawY); // never above nav
        tooltipEl.style.display = "block";
        tooltipEl.style.left    = `${clampedX}px`;
        tooltipEl.style.top     = `${clampedY}px`;
        tipLabel.textContent    = entry.label;
        tipXP.textContent       = `${entry.xpVal.toLocaleString()} XP`;
      }

      // ── Advance edge travelers ───────────────────────
      edgeEntries.forEach(({ src, tgt }, i) => {
        travProgress[i] += travSpeed[i];
        if (travProgress[i] > 1) travProgress[i] = 0;
        tmp.lerpVectors(src, tgt, travProgress[i]);
        travPos[i * 3]     = tmp.x;
        travPos[i * 3 + 1] = tmp.y;
        travPos[i * 3 + 2] = tmp.z;
      });
      travGeo.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    // ── Resize ────────────────────────────────────────
    const onResize = () => {
      const w = Math.max(1, mount.clientWidth || window.innerWidth);
      const h = Math.max(1, mount.clientHeight || window.innerHeight);
      camera.aspect = Math.max(0.1, Math.min(10, w / h));
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, (window.innerWidth < 768 || "ontouchstart" in window) ? 1.5 : 2));
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);
    // Run resize once on next frame in case container wasn't laid out yet
    const resizeId = requestAnimationFrame(() => onResize());

    // ── Cleanup (dispose all Three.js resources to avoid leaks and GPU issues) ──
    const disposeObject = (obj: THREE.Object3D) => {
      if ("geometry" in obj && obj.geometry) (obj.geometry as THREE.BufferGeometry).dispose();
      if ("material" in obj) {
        const m = obj.material as THREE.Material;
        if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
        else if (m) m.dispose();
      }
      obj.children.slice().forEach(disposeObject);
    };

    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      cancelAnimationFrame(resizeId);
      if (touchClearTimer !== null) clearTimeout(touchClearTimer);
      window.removeEventListener("resize", onResize);
      mount.removeEventListener("mousemove",  onMouseMove);
      mount.removeEventListener("mouseleave", onMouseLeave);
      mount.removeEventListener("touchstart", onTouchStart);
      mount.removeEventListener("touchmove",  onTouchMove);
      mount.removeEventListener("touchend",   onTouchEnd);
      tooltipEl.remove();
      disposeObject(scene);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [payload, isDark]);

  return <div ref={mountRef} className="three-graph-root" aria-hidden="true" />;
}
