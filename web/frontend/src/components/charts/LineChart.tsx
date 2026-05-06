import { useMemo, useRef, useState } from "react";

export type LinePoint = {
  label: string;
  value: number;
};

type Props = {
  points: LinePoint[];
  // Stroke color for the line + selection circle ring. Caller picks per chart
  // — sales is green, new-clients is also green in Figma but the manager
  // detail chart is purple.
  lineColor: string;
  // Tooltip body ("Доход 110.000₸"). Caller knows the unit; chart just
  // renders the resulting string and a leading caption above it.
  formatValue: (value: number) => string;
  // Trailing copy in the tooltip ("Доход" before the value). Optional —
  // omit to render only the value.
  tooltipPrefix?: string;
  // Render in the empty state when no points have a non-zero value.
  emptyMessage?: string;
};

const HEIGHT = 280;
const PADDING_LEFT = 8;
const PADDING_RIGHT = 8;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 32;

// Catmull-Rom-style cubic between consecutive points, tension 0.2 → "gentle
// wave". Higher tensions overshoot and look noisy on flat sections.
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

export function LineChart({
  points,
  lineColor,
  formatValue,
  tooltipPrefix,
  emptyMessage = "Нет данных за выбранный период",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(960);

  const hasData = points.length > 0 && points.some((p) => p.value > 0);

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const max = Math.max(...points.map((p) => p.value), 1);
    const min = 0;
    const innerW = Math.max(1, width - PADDING_LEFT - PADDING_RIGHT);
    const innerH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const stepX = points.length === 1 ? 0 : innerW / (points.length - 1);
    const xFor = (i: number) =>
      points.length === 1
        ? PADDING_LEFT + innerW / 2
        : PADDING_LEFT + i * stepX;
    const yFor = (v: number) =>
      PADDING_TOP + innerH - ((v - min) / (max - min || 1)) * innerH;
    const coords: Array<[number, number]> = points.map((p, i) => [
      xFor(i),
      yFor(p.value),
    ]);
    return { coords, xFor, yFor, innerH, innerW };
  }, [points, width]);

  const xLabels = useMemo(() => {
    if (points.length === 0) return [];
    // ~110px per label leaves room for "28 апр" style strings without
    // overlap, regardless of bucket size.
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

  const setRef = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
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
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {hoverIdx != null && (
              <circle
                cx={geom.coords[hoverIdx][0]}
                cy={geom.coords[hoverIdx][1]}
                r={6}
                fill="white"
                stroke={lineColor}
                strokeWidth={2}
              />
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
            {emptyMessage}
          </text>
        )}

        {xLabels.map(({ index, label }, idx) => {
          if (!geom) return null;
          const x = geom.coords[index][0];
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
          valueText={formatValue(points[hoverIdx].value)}
          prefix={tooltipPrefix}
          color={lineColor}
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
  valueText,
  prefix,
  color,
}: {
  x: number;
  y: number;
  containerWidth: number;
  label: string;
  valueText: string;
  prefix?: string;
  color: string;
}) {
  // Flip to the left of the marker when it's in the right half — keeps the
  // panel inside the chart area without overflow.
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
      <p className="text-[13px] font-semibold" style={{ color }}>
        {prefix ? `${prefix} ` : ""}
        {valueText}
      </p>
    </div>
  );
}
