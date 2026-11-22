"use client";

import type { PoseMetrics } from "@/lib/pose-engine";
import { Button, Dialog } from "@/components/ui";

function formatDiag(reserved: number | null): string {
  if (reserved === null || reserved === undefined) return "--";
  const mtu = (reserved >> 4) * 16;
  return `MTU${reserved & 1 ? "✓" : "✗"} 订阅${reserved & 2 ? "✓" : "✗"} 句柄${
    reserved & 4 ? "✓" : "✗"
  } 发送${reserved & 8 ? "✓" : "✗"} ~${mtu}`;
}

export function SettingsDialog({
  open,
  onClose,
  orientation,
  yaw,
  testPose,
  metrics,
  onOrientationChange,
  onYawChange,
  onToggleTestPose,
  onResetDirection,
  onCalibrate,
}: {
  open: boolean;
  onClose: () => void;
  orientation: number;
  yaw: number;
  testPose: boolean;
  metrics: PoseMetrics;
  onOrientationChange: (value: number) => void;
  onYawChange: (value: number) => void;
  onToggleTestPose: () => void;
  onResetDirection: () => void;
  onCalibrate: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="设置"
      description="方向、显示和校准。日常不需要改这些。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={onCalibrate}>
            校准方向
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium leading-4 text-[#4d4d4d]">
              方向
            </span>
            <select
              value={orientation}
              onChange={(event) =>
                onOrientationChange(Number(event.target.value))
              }
              className="h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] text-foreground outline-none transition-colors hover:bg-[#fafafa]"
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium leading-4 text-[#4d4d4d]">
              显示航向
            </span>
            <select
              value={yaw}
              onChange={(event) => onYawChange(Number(event.target.value))}
              className="h-9 w-full rounded-md border border-border bg-white px-2.5 text-[13px] text-foreground outline-none transition-colors hover:bg-[#fafafa]"
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={testPose ? "primary" : "secondary"}
            aria-pressed={testPose}
            onClick={onToggleTestPose}
          >
            测试姿态
          </Button>
          <Button size="sm" variant="secondary" onClick={onResetDirection}>
            重置方向
          </Button>
        </div>

        <div className="rounded-md border border-border bg-[#fafafa] px-3 py-2.5 text-[12px] leading-5 text-[#4d4d4d]">
          这块板子的 IMU 方向固定为 90°，默认已经设好；只有换了安装方向或方向仍不对时，才需要做 3
          步校准。
        </div>

        <div>
          <h3 className="mb-2 text-[12px] font-medium leading-4 text-[#8f8f8f]">
            诊断
          </h3>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[12px] leading-4">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[#8f8f8f]">帧数</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[#4d4d4d]">
                {metrics.frames.toLocaleString("zh-CN")}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[#8f8f8f]">CRC / 丢帧</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[#4d4d4d]">
                {metrics.crcErrors} / {metrics.seqGaps}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[#8f8f8f]">Roll / Pitch</dt>
              <dd className="font-mono text-[11px] tabular-nums text-[#4d4d4d]">
                {metrics.angles
                  ? `${metrics.angles.roll.toFixed(0)}° / ${metrics.angles.pitch.toFixed(0)}°`
                  : "-- / --"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-[#8f8f8f]">BLE</dt>
              <dd className="truncate font-mono text-[11px] tabular-nums text-[#4d4d4d]">
                {formatDiag(metrics.reserved)}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </Dialog>
  );
}
