"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type GraphPayload = {
  nodes: Array<{ id: string; label: string; xp: number }>;
  edges: Array<{ source: string; target: string; type: string }>;
};

function seededGraph(): GraphPayload {
  return {
    nodes: [
      { id: "hive-mind-book", label: "hive-mind-book", xp: 2400 },
      { id: "wallet-signing", label: "wallet-signing", xp: 1100 },
      { id: "economic-shields", label: "economic-shields", xp: 1600 },
      { id: "tag-book", label: "tag-book", xp: 710 }
    ],
    edges: [
      { source: "hive-mind-book", target: "wallet-signing", type: "wiki_link" },
      { source: "hive-mind-book", target: "economic-shields", type: "wiki_link" },
      { source: "hive-mind-book", target: "tag-book", type: "tag" }
    ]
  };
}

export function GraphPreview() {
  const [payload, setPayload] = useState<GraphPayload>(seededGraph());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let active = true;
    const pull = () => {
      fetch("/api/graph", { cache: "no-store" })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as GraphPayload;
          if (active && data.nodes?.length) {
            setPayload(data);
          }
        })
        .catch(() => {
          // Fallback to seeded graph.
        });
    };

    pull();
    const timer = window.setInterval(pull, 8000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const positions = useMemo(() => {
    const radius = 128;
    return payload.nodes.map((node, index) => {
      const theta = (index / payload.nodes.length) * Math.PI * 2;
      return {
        ...node,
        x: Math.cos(theta) * radius,
        y: Math.sin(theta) * radius
      };
    });
  }, [payload.nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frame = 0;
    let mounted = true;

    const render = () => {
      if (!mounted) return;

      frame += 0.01;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);

      payload.edges.forEach((edge, index) => {
        const source = positions.find((n) => n.id === edge.source);
        const target = positions.find((n) => n.id === edge.target);
        if (!source || !target) return;

        ctx.strokeStyle = index % 2 ? "rgba(36,87,255,0.6)" : "rgba(10,157,143,0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        const wobble = Math.sin(frame + index) * 6;
        ctx.moveTo(source.x + wobble, source.y - wobble);
        ctx.lineTo(target.x - wobble, target.y + wobble);
        ctx.stroke();
      });

      positions.forEach((node, index) => {
        const pulse = 7 + (node.xp % 9) + Math.abs(Math.sin(frame * 2 + index) * 3);
        ctx.fillStyle = "rgba(36,87,255,0.9)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.font = "11px var(--font-mono)";
        ctx.fillText(node.label, node.x + 12, node.y + 4);
      });

      ctx.restore();
      requestAnimationFrame(render);
    };

    requestAnimationFrame(render);
    return () => {
      mounted = false;
    };
  }, [payload, positions]);

  return (
    <div className="card section" aria-label="Knowledge graph preview">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <strong>Live graph snapshot</strong>
        <span className="badge mono">public-read</span>
      </div>
      <canvas ref={canvasRef} width={540} height={320} style={{ width: "100%", height: "auto", borderRadius: 12 }} />
    </div>
  );
}
