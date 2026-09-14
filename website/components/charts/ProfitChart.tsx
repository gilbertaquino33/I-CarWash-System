"use client";

import { useState } from "react";
import { niceTicks, useMeasure } from "./useMeasure";
import { peso, pesoCompact } from "@/lib/reports";

export interface ProfitPoint {
  label: string;
  fullLabel: string;
  value: number; // earnings − expenses (can be negative)
}

const BLUE = "#2563eb"; // profit
const RED = "#dc2626"; // loss
const GRID = "#eceef1";
const AXIS_TEXT = "#8d95a3";

/** Diverging columns: above the zero line = profit, below = loss. */
export function ProfitChart({
  points,
  height = 240,
}: {
  points: ProfitPoint[];
  height?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const padL = 56;
  const padR = 16;
  const padT = 16;
  const padB = 30;

  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;

  // Each arm gets its own bound so a small loss doesn't reserve half the chart.
  const maxPos = Math.max(...points.map((p) => Math.max(p.value, 0)), 0);
  const maxNeg = Math.max(...points.map((p) => Math.max(-p.value, 0)), 0);
  const posTicks = niceTicks(maxPos || 1);
  const negTicks = niceTicks(maxNeg || 1);
  const posBound = maxPos > 0 ? posTicks[posTicks.length - 1] : 0;
  const negBound = maxNeg > 0 ? negTicks[negTicks.length - 1] : 0;

  const hasLoss = maxNeg > 0;
  const span = posBound + negBound || 1;
  const zeroY = padT + (posBound / span) * innerH;
  const scale = innerH / span;

  const band = points.length ? innerW / points.length : 0;
  const barW = Math.min(24, Math.max(4, band - 2)); // ≤24px, 2px surface gap

  const handleLeave = () => setHover(null);
  const active = hover != null ? points[hover] : null;

  const allTicks = hasLoss
    ? [...negTicks.filter((t) => t > 0).map((t) => -t).reverse(), ...posTicks]
    : posTicks;

  // Drop ticks that would render on top of each other when an arm is short.
  const axisValues = allTicks.filter((t, i) => {
    if (t === 0 || i === 0) return true;
    const prev = allTicks[i - 1];
    return Math.abs((prev - t) * scale) >= 18;
  });

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Profit per period">
          {axisValues.map((t) => {
            const yy = zeroY - t * scale;
            return (
              <g key={t}>
                <line
                  x1={padL}
                  x2={padL + innerW}
                  y1={yy}
                  y2={yy}
                  stroke={t === 0 ? "#dcdfe5" : GRID}
                  strokeWidth={1}
                />
                <text
                  x={padL - 10}
                  y={yy + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill={AXIS_TEXT}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {pesoCompact(t)}
                </text>
              </g>
            );
          })}

          {points.map((p, i) => {
            const cx = padL + band * i + band / 2;
            const h = Math.abs(p.value) * scale;
            const isLoss = p.value < 0;
            const yPos = isLoss ? zeroY : zeroY - h;
            const color = isLoss ? RED : BLUE;
            const r = Math.min(4, h); // 4px rounded data-end
            return (
              <g
                key={p.label + i}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={handleLeave}
              >
                {/* hit target wider than the mark */}
                <rect
                  x={cx - band / 2}
                  y={padT}
                  width={Math.max(band, 24)}
                  height={innerH}
                  fill="transparent"
                />
                {h > 0 && (
                  <path
                    d={
                      isLoss
                        ? `M ${cx - barW / 2} ${yPos} L ${cx + barW / 2} ${yPos} L ${cx + barW / 2} ${yPos + h - r} Q ${cx + barW / 2} ${yPos + h} ${cx + barW / 2 - r} ${yPos + h} L ${cx - barW / 2 + r} ${yPos + h} Q ${cx - barW / 2} ${yPos + h} ${cx - barW / 2} ${yPos + h - r} Z`
                        : `M ${cx - barW / 2} ${yPos + h} L ${cx - barW / 2} ${yPos + r} Q ${cx - barW / 2} ${yPos} ${cx - barW / 2 + r} ${yPos} L ${cx + barW / 2 - r} ${yPos} Q ${cx + barW / 2} ${yPos} ${cx + barW / 2} ${yPos + r} L ${cx + barW / 2} ${yPos + h} Z`
                    }
                    fill={color}
                    fillOpacity={hover == null || hover === i ? 1 : 0.45}
                  />
                )}
              </g>
            );
          })}

          {points.map((p, i) => {
            const every = Math.max(1, Math.ceil(points.length / (innerW > 640 ? 12 : 6)));
            const isLast = i === points.length - 1;
            // Drop the final label when it would sit on top of the previous one.
            const lastDrawn = Math.floor((points.length - 1) / every) * every;
            if (isLast && i !== lastDrawn && i - lastDrawn < every) return null;
            if (i % every !== 0 && !isLast) return null;
            return (
              <text
                key={"lbl" + i}
                x={padL + band * i + band / 2}
                y={height - 10}
                textAnchor="middle"
                fontSize={11}
                fill={AXIS_TEXT}
              >
                {p.label}
              </text>
            );
          })}
        </svg>
      )}

      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-ink-100 bg-white px-3 py-2 shadow-lift"
          style={{
            left: Math.min(
              Math.max(padL + band * hover! + band / 2 - 60, 0),
              Math.max(0, width - 140)
            ),
            top: 8,
          }}
        >
          <p className="font-display text-sm font-bold text-ink-950">
            {active.value < 0 ? `−${peso(Math.abs(active.value))}` : peso(active.value)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
            <span
              className="h-0.5 w-3 rounded-full"
              style={{ background: active.value < 0 ? RED : BLUE }}
            />
            {active.value < 0 ? "Loss" : "Profit"} · {active.fullLabel}
          </p>
        </div>
      )}
    </div>
  );
}
