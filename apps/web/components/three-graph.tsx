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
}

const DARK: ThemePalette = {
  bg: 0x050a14,
  fogColor: 0x050a14,
  fogDensity: 0.0014,
  // white-blue hub → blue → deep blue → teal → orange
  nodeColors: [0xc0d0ff, 0x4d80ff, 0x2457ff, 0x0dc8b7, 0xf4922b],
  nodeCoreOpacity: 0.95,
  glowInnerOpacity: 0.13,
  glowOuterOpacity: 0.04,
  glowBlending: THREE.AdditiveBlending,
  edgeWiki: 0x3366dd,
  edgeTag: 0x0dc8b7,
  edgeOpacityBright: 0.40,
  edgeOpacityDim: 0.07,
  edgeBlending: THREE.AdditiveBlending,
  travelerColor: 0x99ddff,
  travelerOpacity: 0.85,
  travelerSize: 4,
  starColor: 0x7799cc,
  starSize: 1.3,
  starOpacity: 0.38,
  nebulaColors: [0x112266, 0x0a4433, 0x221100],
  nebulaOpacity: 0.055,
  nebulaBlending: THREE.AdditiveBlending,
};

// Light mode: NormalBlending throughout — additive blending makes things
// invisible on pale backgrounds by adding near-zero brightness.
const LIGHT: ThemePalette = {
  bg: 0xf0f6ff,
  fogColor: 0xe6eeff,
  fogDensity: 0.0015,
  // dark navy hub → royal blue → brand blue → teal → amber
  nodeColors: [0x0a20aa, 0x1040dd, 0x2457ff, 0x0a8070, 0xc05000],
  nodeCoreOpacity: 0.90,
  glowInnerOpacity: 0.12,
  glowOuterOpacity: 0.05,
  glowBlending: THREE.NormalBlending,
  edgeWiki: 0x1a40cc,
  edgeTag: 0x0a8070,
  edgeOpacityBright: 0.50,
  edgeOpacityDim: 0.18,
  edgeBlending: THREE.NormalBlending,
  travelerColor: 0x0a28cc,
  travelerOpacity: 0.80,
  travelerSize: 3.5,
  // Tiny dark-blue specks — visible as depth cues on pale background
  starColor: 0x3355aa,
  starSize: 1.0,
  starOpacity: 0.20,
  // Subtle tinted wisps — not the dark "space cloud" look of dark mode
  nebulaColors: [0x99b8ee, 0x88d8cc, 0xf0b888],
  nebulaOpacity: 0.10,
  nebulaBlending: THREE.NormalBlending,
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

  // ── Live data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const pull = () => {
      fetch("/api/graph", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as GraphPayload;
          if (active && data.nodes?.length) setPayload(data);
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
    const W = mount.clientWidth || window.innerWidth;
    const H = mount.clientHeight || window.innerHeight;

    // ── Scene ─────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(pal.fogColor, pal.fogDensity);

    // ── Camera ────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 2000);
    camera.position.set(0, 0, 400);

    // ── Renderer ──────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(pal.bg, 1);
    renderer.domElement.style.display = "block";
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
    interface NodeEntry { core: THREE.Mesh; inner: THREE.Mesh; outer: THREE.Mesh; phase: number }
    const nodeEntries: NodeEntry[] = [];

    payload.nodes.forEach((node, i) => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;
      const color = nodeColor(node.xp);
      const r = 2.5 + Math.min(node.xp / 700, 8.5);

      const core = new THREE.Mesh(
        new THREE.SphereGeometry(r, 20, 20),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: pal.nodeCoreOpacity })
      );
      core.position.copy(pos);
      graphGroup.add(core);

      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(r * 2.8, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: pal.glowInnerOpacity,
          blending: pal.glowBlending,
          depthWrite: false,
          side: THREE.BackSide,
        })
      );
      inner.position.copy(pos);
      graphGroup.add(inner);

      const outer = new THREE.Mesh(
        new THREE.SphereGeometry(r * 6, 12, 12),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: pal.glowOuterOpacity,
          blending: pal.glowBlending,
          depthWrite: false,
          side: THREE.BackSide,
        })
      );
      outer.position.copy(pos);
      graphGroup.add(outer);

      nodeEntries.push({ core, inner, outer, phase: i * 0.74 });
    });

    // ── Build edges ───────────────────────────────────
    interface EdgeEntry { src: THREE.Vector3; tgt: THREE.Vector3 }
    const validEdges: EdgeEntry[] = [];

    payload.edges.forEach((edge) => {
      const src = nodePositions.get(edge.source);
      const tgt = nodePositions.get(edge.target);
      if (!src || !tgt) return;
      validEdges.push({ src, tgt });

      const edgeColor = edge.type === "wiki_link" ? pal.edgeWiki : pal.edgeTag;

      graphGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([src, tgt]),
          new THREE.LineBasicMaterial({
            color: edgeColor,
            transparent: true,
            opacity: pal.edgeOpacityDim,
            blending: pal.edgeBlending,
            depthWrite: false,
          })
        )
      );
      graphGroup.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([src, tgt]),
          new THREE.LineBasicMaterial({
            color: edgeColor,
            transparent: true,
            opacity: pal.edgeOpacityBright,
            blending: pal.edgeBlending,
            depthWrite: false,
          })
        )
      );
    });

    // ── Traveling edge particles ───────────────────────
    const travCount = validEdges.length;
    const travPos = new Float32Array(travCount * 3);
    const travProgress = validEdges.map(() => Math.random());
    const travSpeed = validEdges.map(() => 0.003 + Math.random() * 0.006);
    const travGeo = new THREE.BufferGeometry();
    travGeo.setAttribute("position", new THREE.BufferAttribute(travPos, 3));
    graphGroup.add(
      new THREE.Points(
        travGeo,
        new THREE.PointsMaterial({
          color: pal.travelerColor,
          size: pal.travelerSize,
          transparent: true,
          opacity: pal.travelerOpacity,
          blending: pal.edgeBlending,
          depthWrite: false,
          sizeAttenuation: true,
        })
      )
    );

    // ── Starfield / depth particles ────────────────────
    const starCount = 2200;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      starPos[i * 3]     = (Math.random() - 0.5) * 3000;
      starPos[i * 3 + 1] = (Math.random() - 0.5) * 3000;
      starPos[i * 3 + 2] = (Math.random() - 0.5) * 3000;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    scene.add(
      new THREE.Points(
        starGeo,
        new THREE.PointsMaterial({
          color: pal.starColor,
          size: pal.starSize,
          transparent: true,
          opacity: pal.starOpacity,
          blending: pal.edgeBlending,
          depthWrite: false,
          sizeAttenuation: true,
        })
      )
    );

    // ── Atmospheric clouds ─────────────────────────────
    pal.nebulaColors.forEach((color, layer) => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(160 * 3);
      for (let i = 0; i < 160; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 700;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 700;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 700;
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(
        new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color,
            size: 22 + layer * 8,
            transparent: true,
            opacity: pal.nebulaOpacity,
            blending: pal.nebulaBlending,
            depthWrite: false,
            sizeAttenuation: true,
          })
        )
      );
    });

    // ── Animation loop ────────────────────────────────
    const tmp = new THREE.Vector3();
    let t = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      t += 0.004;

      // Camera orbits slowly
      const camAngle = t * 0.065;
      camera.position.x = Math.sin(camAngle) * 400;
      camera.position.z = Math.cos(camAngle) * 400;
      camera.position.y = Math.sin(t * 0.022) * 100;
      camera.lookAt(0, 0, 0);

      // Graph tilts gently
      graphGroup.rotation.y = t * 0.022;
      graphGroup.rotation.x = Math.sin(t * 0.013) * 0.14;

      // Pulse each node
      nodeEntries.forEach(({ core, inner, outer, phase }) => {
        const s = 1 + Math.sin(t * 1.4 + phase) * 0.08;
        core.scale.setScalar(s);
        inner.scale.setScalar(s * 1.2);
        outer.scale.setScalar(s * 1.4);
      });

      // Advance edge travelers (group-local space)
      validEdges.forEach(({ src, tgt }, i) => {
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
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    // ── Cleanup ───────────────────────────────────────
    cleanupRef.current = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", onResize);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [payload, isDark]);

  return <div ref={mountRef} style={{ width: "100%", height: "100%" }} aria-hidden="true" />;
}
