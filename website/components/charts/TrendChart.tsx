"use client";

import { useState } from "react";
import { niceTicks, useMeasure } from "./useMeasure";
import { peso, pesoCompact } from "@/lib/reports";

export interface TrendPoint {
  label: string;
  fullLabel: string;
  value: number;
}

const BLUE = "#2563eb";
const GRID = "#eceef1";
const AXIS_TEXT = "#8d95a3";

export function TrendChart({
  points,
  height = 260,
}: {
  points: TrendPoint[];
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

  const maxValue = Math.max(...points.map((p) => p.value), 0);
  const ticks = niceTicks(maxValue || 1);
  const yMax = ticks[ticks.length - 1] || 1;

  const x = (i: number) =>
    points.length <= 1 ? padL + innerW / 2 : padL + (i / (points.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - (v / yMax) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`)
    .join(" ");
  const areaPath = points.length
    ? `${linePath} L ${x(points.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`
    : "";

  // Thin out x labels so they never collide.
  const labelEvery = Math.max(1, Math.ceil(points.length / (innerW > 640 ? 12 : 6)));

  const peak = points.reduce(
    (best, p, i) => (p.value > (points[best]?.value ?? -1) ? i : best),
    0
  );

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!points.length || innerW <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const ratio = (px - padL) / innerW;
    const idx = Math.round(ratio * (points.length - 1));
    setHover(Math.min(points.length - 1, Math.max(0, idx)));
  };

  const active = hover != null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          onPointerMove={handleMove}
          onPointerLeave={() => setHover(null)}
          className="touch-none"
          role="img"
          aria-label="Earnings over time"
        >
          {/* gridlines + y ticks */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padL}
                x2={padL + innerW}
                y1={y(t)}
                y2={y(t)}
                stroke={GRID}
                strokeWidth={1}
              />
              <text
                x={padL - 10}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill={AXIS_TEXT}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {pesoCompact(t)}
              </text>
            </g>
          ))}

          {/* area wash at ~10% */}
          {points.length > 1 && <path d={areaPath} fill={BLUE} fillOpacity={0.1} />}

          {/* line */}
          {points.length > 1 && (
            <path
              d={linePath}
              fill="none"
              stroke={BLUE}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* single-point fallback */}
          {points.length === 1 && (
            <circle cx={x(0)} cy={y(points[0].value)} r={5} fill={BLUE} />
          )}

          {/* x labels */}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text
                key={p.label + i}
                x={x(i)}
                y={height - 10}
                textAnchor="middle"
                fontSize={11}
                fill={AXIS_TEXT}
              >
                {p.label}
              </text>
            ) : null
          )}

          {/* Marks the best day. Its value is named in the card header, so a
              text label here would only duplicate it and crowd the line. */}
          {points.length > 1 && maxValue > 0 && hover == null && (
            <circle
              cx={x(peak)}
              cy={y(points[peak].value)}
              r={4.5}
              fill={BLUE}
              stroke="#ffffff"
              strokeWidth={2}
            />
          )}

          {/* crosshair */}
          {active && (
            <>
              <line
                x1={x(hover!)}
                x2={x(hover!)}
                y1={padT}
                y2={padT + innerH}
                stroke={BLUE}
                strokeWidth={1}
                strokeOpacity={0.4}
              />
              <circle
                cx={x(hover!)}
                cy={y(active.value)}
                r={5}
                fill={BLUE}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </>
          )}
        </svg>
      )}

      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-xl border border-ink-100 bg-white px-3 py-2 shadow-lift"
          style={{
            left: Math.min(Math.max(x(hover!) - 60, 0), Math.max(0, width - 130)),
            top: 8,
          }}
        >
          <p className="font-display text-sm font-bold text-ink-950">
            {peso(active.value)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-500">
            <span className="h-0.5 w-3 rounded-full" style={{ background: BLUE }} />
            {active.fullLabel}
          </p>
        </div>
      )}
    </div>
  );
}
