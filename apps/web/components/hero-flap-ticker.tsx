"use client";

import { useEffect, useMemo, useState } from "react";

type FlapCell = {
  current: string;
  next: string;
  flipping: boolean;
};

const HOLD_MS = 3600;
const FLAP_HALF_MS = 170;
const FLAP_STAGGER_MS = 22;

function padToBoard(text: string, width: number): string[] {
  return text.padEnd(width, " ").slice(0, width).split("");
}

export function HeroFlapTicker({ slogans }: { slogans: string[] }) {
  const normalizedSlogans = useMemo(
    () => slogans.map((slogan) => slogan.trim().toUpperCase()).filter((slogan) => slogan.length > 0),
    [slogans],
  );

  const boardWidth = useMemo(
    () => normalizedSlogans.reduce((max, slogan) => Math.max(max, slogan.length), 0),
    [normalizedSlogans],
  );

  const [activeIndex, setActiveIndex] = useState(0);
  const [cells, setCells] = useState<FlapCell[]>(() => {
    const initialChars = padToBoard(normalizedSlogans[0] ?? "", boardWidth);
    return initialChars.map((char) => ({ current: char, next: char, flipping: false }));
  });

  useEffect(() => {
    const initialChars = padToBoard(normalizedSlogans[0] ?? "", boardWidth);
    setCells(initialChars.map((char) => ({ current: char, next: char, flipping: false })));
    setActiveIndex(0);
  }, [boardWidth, normalizedSlogans]);

  useEffect(() => {
    if (normalizedSlogans.length < 2) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % normalizedSlogans.length);
    }, HOLD_MS);

    return () => window.clearInterval(interval);
  }, [normalizedSlogans.length]);

  useEffect(() => {
    if (boardWidth === 0 || normalizedSlogans.length === 0) {
      return undefined;
    }

    const targetChars = padToBoard(normalizedSlogans[activeIndex] ?? "", boardWidth);

    setCells((prev) => {
      let hasChanges = false;
      const nextCells = prev.map((cell, index) => {
        const target = targetChars[index] ?? " ";
        if (cell.current === target) {
          return cell;
        }
        hasChanges = true;
        return {
          current: cell.current,
          next: target,
          flipping: true,
        };
      });
      return hasChanges ? nextCells : prev;
    });

    const settleMs = FLAP_STAGGER_MS * Math.max(boardWidth - 1, 0) + FLAP_HALF_MS * 2 + 70;
    const timeout = window.setTimeout(() => {
      setCells((prev) => {
        let hasFlips = false;
        const settled = prev.map((cell) => {
          if (!cell.flipping) {
            return cell;
          }
          hasFlips = true;
          return {
            current: cell.next,
            next: cell.next,
            flipping: false,
          };
        });
        return hasFlips ? settled : prev;
      });
    }, settleMs);

    return () => window.clearTimeout(timeout);
  }, [activeIndex, boardWidth, normalizedSlogans]);

  if (boardWidth === 0) {
    return null;
  }

  return (
    <div className="hero-ticker" aria-label="Departures board slogans">
      <span className="hero-ticker-label mono">Departures</span>
      <div className="hero-flap-display" role="status" aria-live="polite" aria-atomic="true">
        <div
          className="hero-flap-board"
          style={
            {
              "--flap-cols": String(boardWidth),
              "--flap-half-duration": `${FLAP_HALF_MS}ms`,
            } as React.CSSProperties
          }
          aria-hidden="true"
        >
          {cells.map((cell, index) => {
            const classes = [
              "hero-flap-cell",
              cell.flipping ? "is-flipping" : "",
              cell.current === " " && cell.next === " " ? "is-blank" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <span
                className={classes}
                key={index}
                style={{ "--flap-delay": `${index * FLAP_STAGGER_MS}ms` } as React.CSSProperties}
              >
                <span className="flap-half flap-top-static">
                  <span className="flap-glyph">{cell.flipping ? cell.next : cell.current}</span>
                </span>
                <span className="flap-half flap-bottom-static">
                  <span className="flap-glyph">{cell.current}</span>
                </span>
                {cell.flipping ? (
                  <>
                    <span className="flap-half flap-top-flip">
                      <span className="flap-glyph">{cell.current}</span>
                    </span>
                    <span className="flap-half flap-bottom-flip">
                      <span className="flap-glyph">{cell.next}</span>
                    </span>
                  </>
                ) : null}
              </span>
            );
          })}
        </div>
        <span className="hero-flap-live">{normalizedSlogans[activeIndex]}</span>
      </div>
    </div>
  );
}
