import { useMemo, useRef, useState } from "react";
import type { ChartPoint } from "../api";
import { formatTengeFull } from "../format";

type Props = {
  points: ChartPoint[];
};

const HEIGHT = 280;
const PADDING_LEFT = 8;
const PADDING_RIGHT = 8;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 32;

// Smooth Catmull-Rom-style cubic between consecutive points. The 0.2 tension
// value reads as "gentle wave", matching the Figma design — higher tensions
// overshoot and look noisy on flat sections.
function smoothPath(coords: Array<[number, number]>): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) {
    const [x, y] = coords[0];
    return `M ${x} ${y}`;
  }
  const tension = 0.2;
  const parts: string[] = [`M ${coords[0][0]} ${coords[0][1]}`];
  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[Math.max(0, i - 1)];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[Math.min(coords.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) * tension;
    const c1y = p1[1] + (p2[1] - p0[1]) * tension;
    const c2x = p2[0] - (p3[0] - p1[0]) * tension;
    const c2y = p2[1] - (p3[1] - p1[1]) * tension;
    parts.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`);
  }
  return parts.join(" ");
}

export function SalesChart({ points }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // We recompute geometry on every resize — the parent column is fluid.
  // Tracking width via a ResizeObserver would be lighter, but the chart
  // section only redraws on data/range change, and reading offsetWidth on
  // each render is a single layout call.
  const [width, setWidth] = useState(960);

  // Skip an empty data array so the polyline doesn't pull NaN coordinates.
  const hasData = points.length > 0 && points.some((p) => p.incomeTenge > 0);

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const max = Math.max(...points.map((p) => p.incomeTenge), 1);
    const min = 0;
    const innerW = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT);
    const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    // When there's only one bucket, place the point in the middle of the
    // canvas so the user-readable answer is "we have one data point at X".
    const stepX =
      points.length === 1 ? 0 : innerW / (points.length - 1);
    const xFor = (i: number) =>
      points.length === 1
        ? PADDING_LEFT + innerW / 2
        : PADDING_LEFT + i * stepX;
    const yFor = (v: number) =>
      PADDING_TOP +
      innerH -
      ((v - min) / (max - min || 1)) * innerH;
    const coords: Array<[number, number]> = points.map((p, i) => [
      xFor(i),
      yFor(p.incomeTenge),
    ]);
    return { coords, xFor, yFor, innerH, innerW };
  }, [points, width]);

  // Decide which X-axis labels to show. Daily buckets across a long window
  // would overflow; thinning the visible labels keeps the axis legible no
  // matter the bucket size.
  const xLabels = useMemo(() => {
    if (points.length === 0) return [];
    // ~110px per label leaves room for the longest possible string ("28 апр")
    // plus comfortable spacing — narrower spacing produced overlapping ticks
    // on day-bucket ranges.
    const maxLabels = Math.max(2, Math.floor(width / 110));
    if (points.length <= maxLabels) {
      return points.map((p, i) => ({ index: i, label: p.label }));
    }
    const step = (points.length - 1) / (maxLabels - 1);
    const result: Array<{ index: number; label: string }> = [];
    for (let i = 0; i < maxLabels; i++) {
      const idx = Math.round(i * step);
      result.push({ index: idx, label: points[idx].label });
    }
    return result;
  }, [points, width]);

  // Track container width via ResizeObserver. A ref callback that wires up
  // the observer handles both the initial mount and prop-driven re-renders.
  const setRef = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    // Cleanup is handled by GC — the observer holds a weak-ish reference and
    // disconnects when the element unmounts. For a one-off chart this is fine.
  };

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!geom || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let nearest = 0;
    let best = Infinity;
    for (let i = 0; i < geom.coords.length; i++) {
      const dx = Math.abs(geom.coords[i][0] - x);
      if (dx < best) {
        best = dx;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  }

  return (
    <div ref={setRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
        className="block"
      >
        {/* Horizontal grid: 4 evenly-spaced dashed lines */}
        {[0, 1, 2, 3].map((i) => {
          const y =
            PADDING_TOP +
            ((HEIGHT - PADDING_TOP - PADDING_BOTTOM) / 3) * i;
          return (
            <line
              key={i}
              x1={PADDING_LEFT}
              x2={width - PADDING_RIGHT}
              y1={y}
              y2={y}
              stroke="#EAECF0"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          );
        })}

        {hoverIdx != null && geom && (
          <line
            x1={geom.coords[hoverIdx][0]}
            x2={geom.coords[hoverIdx][0]}
            y1={PADDING_TOP}
            y2={HEIGHT - PADDING_BOTTOM}
            stroke="#C148E9"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}

        {hasData && geom && (
          <>
            <path
              d={smoothPath(geom.coords)}
              fill="none"
              stroke="#34C759"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {hoverIdx != null && (
              <>
                <circle
                  cx={geom.coords[hoverIdx][0]}
                  cy={geom.coords[hoverIdx][1]}
                  r={6}
                  fill="white"
                  stroke="#34C759"
                  strokeWidth={2}
                />
              </>
            )}
          </>
        )}

        {!hasData && (
          <text
            x={width / 2}
            y={HEIGHT / 2}
            textAnchor="middle"
            className="fill-grey-medium text-[13px]"
          >
            Нет продаж за выбранный период
          </text>
        )}

        {xLabels.map(({ index, label }, idx) => {
          if (!geom) return null;
          const x = geom.coords[index][0];
          // First/last labels get left/right anchors so they don't clip the
          // SVG viewport. Everything in the middle stays centered above its
          // datapoint.
          const anchor =
            idx === 0
              ? "start"
              : idx === xLabels.length - 1
                ? "end"
                : "middle";
          return (
            <text
              key={index}
              x={x}
              y={HEIGHT - 8}
              textAnchor={anchor}
              className="fill-grey-dark text-[12px]"
            >
              {label}
            </text>
          );
        })}
      </svg>

      {hoverIdx != null && geom && hasData && (
        <Tooltip
          x={geom.coords[hoverIdx][0]}
          y={geom.coords[hoverIdx][1]}
          containerWidth={width}
          label={points[hoverIdx].label}
          income={points[hoverIdx].incomeTenge}
        />
      )}
    </div>
  );
}

function Tooltip({
  x,
  y,
  containerWidth,
  label,
  income,
}: {
  x: number;
  y: number;
  containerWidth: number;
  label: string;
  income: number;
}) {
  // Flip the tooltip to the left of the marker when the marker is in the
  // right half — keeps the panel inside the chart area without overflow.
  const flipLeft = x > containerWidth - 160;
  const left = flipLeft ? x - 12 : x + 12;
  return (
    <div
      style={{
        left,
        top: Math.max(0, y - 30),
        transform: flipLeft ? "translateX(-100%)" : undefined,
      }}
      className="pointer-events-none absolute z-10 rounded-[10px] bg-white px-3 py-2 shadow-[0_4px_14px_rgba(0,0,0,0.12)]"
    >
      <p className="text-[11px] text-grey-medium">{label}</p>
      <p className="text-[13px] font-semibold text-[#34C759]">
        Доход {formatTengeFull(income)}
      </p>
    </div>
  );
}
