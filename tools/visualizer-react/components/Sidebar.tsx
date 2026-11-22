"use client";

import { POSTURE_ZH, type PoseMetrics } from "@/lib/pose-engine";
import { Button, SectionLabel, Segmented } from "@/components/ui";
import { Onboarding } from "@/components/Onboarding";

export function Sidebar({
  metrics,
  rate,
  deviceName,
  headingLock,
  hint,
  onboardingOpen,
  onModeChange,
  onFlip,
  onZero,
  onResetView,
  onDemo,
  onSettings,
  onOnboardingClose,
  onOnboardingFlip,
}: {
  metrics: PoseMetrics;
  rate: number;
  deviceName: string;
  headingLock: boolean;
  hint: string;
  onboardingOpen: boolean;
  onModeChange: (lock: boolean) => void;
  onFlip: () => void;
  onZero: () => void;
  onResetView: () => void;
  onDemo: () => void;
  onSettings: () => void;
  onOnboardingClose: () => void;
  onOnboardingFlip: () => void;
}) {
  const posture =
    metrics.posture === null
      ? "--"
      : POSTURE_ZH[metrics.posture] ?? `#${metrics.posture}`;
  const confidence =
    metrics.confidence === null ? "--" : `${metrics.confidence}%`;
  const battery =
    metrics.battery === null ? "--" : `${metrics.battery}%`;
  const rateText = metrics.demo
    ? "演示"
    : rate > 0
      ? `${rate.toFixed(1)} Hz`
      : "--";
  const device = deviceName || "未连接";

  return (
    <aside className="scrollbar-thin overflow-hidden rounded-xl border border-border bg-white shadow-[0_1px_1px_rgba(0,0,0,0.04)] lg:sticky lg:top-[88px] lg:flex lg:max-h-[calc(100dvh-112px)] lg:flex-col lg:overflow-y-auto">
      <section className="px-5 pt-5">
        <h2 className="text-[12px] font-medium leading-4 text-[#8f8f8f]">
          当前姿态
        </h2>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <strong className="text-[36px] font-semibold leading-[1.05] tracking-[-0.01em] text-[#171717]">
            {posture}
          </strong>
          <span className="text-[12px] leading-4 text-[#8f8f8f]">
            置信度{" "}
            <b className="font-mono text-[12px] font-medium tabular-nums text-[#4d4d4d]">
              {confidence}
            </b>
          </span>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-3 divide-x divide-border border-y border-border">
        <div className="px-4 py-3">
          <SectionLabel>电量</SectionLabel>
          <p className="mt-1 font-mono text-[13px] font-medium tabular-nums text-[#171717]">
            {battery}
          </p>
        </div>
        <div className="px-4 py-3">
          <SectionLabel>速率</SectionLabel>
          <p className="mt-1 font-mono text-[13px] font-medium tabular-nums text-[#171717]">
            {rateText}
          </p>
        </div>
        <div className="min-w-0 px-4 py-3">
          <SectionLabel>设备</SectionLabel>
          <p
            className="mt-1 truncate text-[12px] font-medium text-[#171717]"
            title={device}
          >
            {device}
          </p>
        </div>
      </div>

      <section className="px-5 py-4">
        <h2 className="mb-2 text-[12px] font-medium leading-4 text-[#8f8f8f]">
          跟随模式
        </h2>
        <Segmented
          label="跟随模式"
          value={headingLock ? "lock" : "3d"}
          options={[
            { value: "3d", label: "3D 全姿态" },
            { value: "lock", label: "锁航向" },
          ]}
          onChange={(value) => onModeChange(value === "lock")}
        />
      </section>

      <section className="grid grid-cols-2 gap-1.5 border-t border-border px-5 py-4">
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={metrics.demo}
          onClick={onDemo}
          className={metrics.demo ? "bg-[#f2f2f2]" : undefined}
        >
          自动演示
        </Button>
        <Button variant="secondary" size="sm" onClick={onFlip}>
          翻转 180°
        </Button>
        <Button variant="secondary" size="sm" onClick={onZero}>
          归零
        </Button>
        <Button variant="secondary" size="sm" onClick={onResetView}>
          复位视角
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onSettings}
          className="col-span-2 mt-0.5 justify-start px-2"
        >
          高级设置
        </Button>
      </section>

      {onboardingOpen ? (
        <Onboarding onFlip={onOnboardingFlip} onClose={onOnboardingClose} />
      ) : null}

      <div className="mt-auto border-t border-border px-5 py-3">
        <p
          aria-live="polite"
          className="text-[11px] leading-[1.55] text-[#8f8f8f]"
        >
          {hint}
        </p>
      </div>
    </aside>
  );
}
