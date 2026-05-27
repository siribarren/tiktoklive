"use client";

import * as React from "react";

import { cn } from "./utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export type HeatmapMatrixCell = {
  row: string;
  col: string;
  value: number;
  rowIndex: number;
  colIndex: number;
};

type HeatmapCalendarProps = {
  rows: string[];
  cols: string[];
  values: number[][];
  className?: string;
  cellSize?: number;
  cellGap?: number;
  palette?: string[];
  emptyCellColor?: string;
  emptyCellBorderColor?: string;
  legend?: boolean;
  lessText?: React.ReactNode;
  moreText?: React.ReactNode;
  rowLabelWidth?: number;
  showCellValues?: boolean;
  showIntensityAverages?: boolean;
  intensityLabel?: string;
  renderTooltip?: (cell: HeatmapMatrixCell) => React.ReactNode;
  onCellClick?: (cell: HeatmapMatrixCell) => void;
};

function safeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return parsed;
}

function clamp(value: number, min: number, max: number) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function safeDivide(numerator: number, denominator: number) {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function resolveLevel(value: number) {
  return Math.max(0, Math.round(safeNumber(value)));
}

function resolveCellColor(level: number, palette: string[], emptyCellColor: string) {
  if (level <= 0) {
    return emptyCellColor;
  }
  const index = clamp(level, 0, palette.length - 1);
  return palette[index] ?? palette[palette.length - 1] ?? emptyCellColor;
}

export function HeatmapCalendar({
  rows,
  cols,
  values,
  className,
  cellSize = 28,
  cellGap = 2,
  palette = [],
  emptyCellColor = "rgb(255, 255, 255)",
  emptyCellBorderColor = "rgb(229, 229, 229)",
  legend = true,
  lessText = "Menos",
  moreText = "Mas",
  rowLabelWidth = 132,
  showCellValues = false,
  showIntensityAverages = true,
  intensityLabel = "INTENSIDAD MEDIA",
  renderTooltip,
  onCellClick,
}: HeatmapCalendarProps) {
  const hasData = rows.length > 0 && cols.length > 0;
  const effectivePalette = palette.length > 0 ? palette : ["rgb(255, 255, 255)"];
  const summaryColumnWidth = Math.max(112, Math.floor(rowLabelWidth * 0.8));
  const safeMatrix = rows.map((_, rowIndex) => {
    return cols.map((_, colIndex) => safeNumber(values?.[rowIndex]?.[colIndex]));
  });
  const rowAverages = safeMatrix.map((rowValues) => {
    const rowTotal = rowValues.reduce((sum, value) => sum + safeNumber(value), 0);
    return safeDivide(rowTotal, rowValues.length);
  });
  const colAverages = cols.map((_, colIndex) => {
    const colTotal = safeMatrix.reduce((sum, rowValues) => sum + safeNumber(rowValues?.[colIndex]), 0);
    return safeDivide(colTotal, safeMatrix.length);
  });
  const allValues = safeMatrix.flat();
  const overallAverage = safeDivide(
    allValues.reduce((sum, value) => sum + safeNumber(value), 0),
    allValues.length
  );
  const gridMinWidth = rowLabelWidth + cols.length * 72 + (showIntensityAverages ? summaryColumnWidth : 0);

  const getCellTextColor = (value: number) => {
    const level = resolveLevel(value);
    return level >= 2 ? "rgb(255, 255, 255)" : "rgb(26, 26, 26)";
  };

  if (!hasData) {
    return null;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-3">
        <div className="w-full min-w-[920px]" style={{ minWidth: `${Math.max(920, gridMinWidth)}px` }}>
          <table
            className="w-full table-fixed border-separate"
            style={{ borderSpacing: `${cellGap}px ${cellGap}px` }}
          >
            <colgroup>
              <col style={{ width: `${rowLabelWidth}px` }} />
              {cols.map((_, index) => (
                <col key={`col-width-${index}`} />
              ))}
              {showIntensityAverages ? <col style={{ width: `${summaryColumnWidth}px` }} /> : null}
            </colgroup>
            <thead>
              <tr>
                <th className="p-0" />
                {cols.map((col, index) => (
                  <th
                    key={`col-${col}-${index}`}
                    className="pb-1 text-center text-[10px] font-medium tracking-[0.04em] text-slate-500"
                  >
                    {col}
                  </th>
                ))}
                {showIntensityAverages ? (
                  <th className="pb-1 text-center text-[10px] font-medium uppercase tracking-[0.06em] text-slate-500">
                    <span className="block leading-tight">Intensidad</span>
                    <span className="block leading-tight">media</span>
                  </th>
                ) : null}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${row}-${rowIndex}`}>
                  <th
                    className="pr-2 text-left text-[12px] font-normal tracking-[0.01em] text-slate-600"
                    title={row}
                  >
                    <span className="truncate">{row}</span>
                  </th>

                  {cols.map((col, colIndex) => {
                    const rawValue = safeNumber(safeMatrix?.[rowIndex]?.[colIndex]);
                    const level = resolveLevel(rawValue);
                    const backgroundColor = resolveCellColor(level, effectivePalette, emptyCellColor);
                    const cellData: HeatmapMatrixCell = {
                      row,
                      col,
                      value: rawValue,
                      rowIndex,
                      colIndex,
                    };
                    const tooltipNode = renderTooltip ? renderTooltip(cellData) : (
                      <div className="space-y-1">
                        <p className="text-[11px] tracking-[0.04em]">
                          {row} • {col}
                        </p>
                        <p className="text-sm font-semibold">Score hot: {rawValue}</p>
                      </div>
                    );

                    return (
                      <td key={`cell-${rowIndex}-${colIndex}`} className="p-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onCellClick?.(cellData)}
                              className="block h-8 w-full rounded-[3px] text-[11px] font-semibold outline-none ring-offset-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              style={{
                                backgroundColor,
                                border: level <= 0 ? `1px solid ${emptyCellBorderColor}` : "1px solid transparent",
                                color: getCellTextColor(rawValue),
                              }}
                              aria-label={`${row} ${col}: ${rawValue}`}
                            >
                              {showCellValues ? rawValue : ""}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent sideOffset={8} className="max-w-[260px] bg-white text-slate-900 shadow-md">
                            {tooltipNode}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    );
                  })}

                  {showIntensityAverages ? (
                    <td className="p-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="block h-8 w-full rounded-[3px] text-[11px] font-semibold outline-none ring-offset-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            style={{
                              backgroundColor: resolveCellColor(
                                resolveLevel(rowAverages[rowIndex] ?? 0),
                                effectivePalette,
                                emptyCellColor
                              ),
                              border: `1px solid ${emptyCellBorderColor}`,
                              color: getCellTextColor(rowAverages[rowIndex] ?? 0),
                            }}
                            aria-label={`${row} intensidad media: ${rowAverages[rowIndex] ?? 0}`}
                          >
                            {showCellValues ? safeNumber(rowAverages[rowIndex] ?? 0).toFixed(1) : ""}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8} className="max-w-[260px] bg-white text-slate-900 shadow-md">
                          <div className="space-y-1">
                            <p className="text-[11px] tracking-[0.04em]">{row} • intensidad media</p>
                            <p className="text-sm font-semibold">{safeNumber(rowAverages[rowIndex] ?? 0).toFixed(2)}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  ) : null}
                </tr>
              ))}

              {showIntensityAverages ? (
                <tr>
                  <th className="pt-1 pr-2 text-left text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">
                    <span className="block leading-tight">Intensidad</span>
                    <span className="block leading-tight">media</span>
                  </th>
                  {colAverages.map((value, colIndex) => (
                    <td key={`col-average-${colIndex}`} className="p-0">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="block h-8 w-full rounded-[3px] text-[11px] font-semibold outline-none ring-offset-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            style={{
                              backgroundColor: resolveCellColor(resolveLevel(value), effectivePalette, emptyCellColor),
                              border: `1px solid ${emptyCellBorderColor}`,
                              color: getCellTextColor(value),
                            }}
                            aria-label={`${cols[colIndex]} intensidad media: ${value}`}
                          >
                            {showCellValues ? safeNumber(value).toFixed(1) : ""}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8} className="max-w-[260px] bg-white text-slate-900 shadow-md">
                          <div className="space-y-1">
                            <p className="text-[11px] tracking-[0.04em]">{cols[colIndex]} • intensidad media</p>
                            <p className="text-sm font-semibold">{safeNumber(value).toFixed(2)}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </td>
                  ))}
                  <td className="p-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="block h-8 w-full rounded-[3px] text-[11px] font-semibold outline-none ring-offset-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          style={{
                            backgroundColor: resolveCellColor(
                              resolveLevel(overallAverage),
                              effectivePalette,
                              emptyCellColor
                            ),
                            border: `1px solid ${emptyCellBorderColor}`,
                            color: getCellTextColor(overallAverage),
                          }}
                          aria-label={`Intensidad media general: ${overallAverage}`}
                        >
                          {showCellValues ? safeNumber(overallAverage).toFixed(1) : ""}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent sideOffset={8} className="max-w-[260px] bg-white text-slate-900 shadow-md">
                        <div className="space-y-1">
                          <p className="text-[11px] tracking-[0.04em]">Intensidad media general</p>
                          <p className="text-sm font-semibold">{safeNumber(overallAverage).toFixed(2)}</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {legend ? (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{lessText}</span>
          {effectivePalette.map((color, index) => (
            <span
              key={`legend-${color}-${index}`}
              className="inline-block rounded-[999px]"
              style={{
                width: "16px",
                height: "16px",
                backgroundColor: color,
                border: index === 0 ? `1px solid ${emptyCellBorderColor}` : "1px solid transparent",
              }}
            />
          ))}
          <span>{moreText}</span>
        </div>
      ) : null}
    </div>
  );
}
