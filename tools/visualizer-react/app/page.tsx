"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SceneApi } from "@/components/BoardScene";
import { CalibrationDialog } from "@/components/CalibrationDialog";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Sidebar } from "@/components/Sidebar";
import { Button } from "@/components/ui";
import { useBle } from "@/hooks/useBle";
import { PoseEngine } from "@/lib/pose-engine";

const BoardScene = dynamic(
  () => import("@/components/BoardScene").then((module) => module.BoardScene),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-[#0a0a0a]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    ),
  },
);

export default function Page() {
  const [engine] = useState(() => new PoseEngine());
  const {
    info: ble,
    rate,
    metrics,
    connect: connectBle,
    disconnect: disconnectBle,
  } = useBle(engine);
  const sceneApiRef = useRef<SceneApi | null>(null);

  const [headingLock, setHeadingLock] = useState(engine.headingLock);
  const [orientation, setOrientation] = useState(engine.orientation);
  const [yaw, setYaw] = useState(0);
  const [testPose, setTestPose] = useState(engine.testPose);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(true);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => {
    engine.hydrateFromStorage();
    setYaw(engine.yawOffset);
  }, [engine]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("sp.onboarded") === "1") {
        setOnboardingOpen(false);
      }
    } catch {
      // ignore storage failures
    }
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  useEffect(() => {
    // Dev-only: keep Next's floating dev-tools badge out of the product preview.
    const hideDevBadge = () => {
      document.querySelectorAll("nextjs-portal").forEach((node) => {
        (node as HTMLElement).style.setProperty("display", "none", "important");
      });
    };
    hideDevBadge();
    const observer = new MutationObserver(hideDevBadge);
    observer.observe(document.documentElement, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const handleMode = (lock: boolean) => {
    engine.setMode(lock);
    setHeadingLock(lock);
    showToast(
      lock
        ? "锁航向：只跟倾斜，不会漂"
        : "3D 全姿态：跟全部旋转，久了会漂，点「归零」重置",
    );
  };

  const handleYaw = (value: number) => {
    engine.setYaw(value);
    setYaw(value);
    showToast(`显示航向 ${value}°`);
  };

  const handleFlip = () => {
    const next = engine.flipYaw();
    setYaw(next);
    showToast(`显示朝向翻转 180°（航向 ${next}°）；不对再点一次`);
  };

  const handleOrientation = (value: number) => {
    engine.setOrientation(value);
    engine.clearCalibration();
    setOrientation(value);
    showToast(`方向 ${value}°；已清除旧校准`);
  };

  const handleToggleTestPose = () => {
    const next = !testPose;
    engine.setTestPose(next);
    setTestPose(next);
    showToast(next ? "测试姿态：固定 20° 倾斜" : "回到实时数据");
  };

  const handleResetDirection = () => {
    engine.setOrientation(90);
    engine.setYaw(0);
    engine.clearCalibration();
    setOrientation(90);
    setYaw(0);
    showToast("方向已重置（90° / 显示航向 0°）");
  };

  const handleZero = () => {
    engine.zero();
    showToast("已把当前姿态设为基准");
  };

  const handleResetView = () => {
    sceneApiRef.current?.resetView();
    showToast("视角已复位");
  };

  const handleDemo = () => {
    const next = !engine.demo;
    engine.setDemo(next);
    showToast(next ? "自动演示" : "等待实时数据");
  };

  const handleCalibrationApplied = () => {
    showToast("方向校准完成");
  };

  const handleOnboardingClose = () => {
    setOnboardingOpen(false);
    try {
      window.localStorage.setItem("sp.onboarded", "1");
    } catch {
      // ignore storage failures
    }
  };

  useEffect(() => {
    if (ble.state === "connected") showToast("已连接 SleepPosture");
  }, [ble.state, showToast]);

  useEffect(() => {
    if (ble.state === "error" && ble.error) showToast(`BLE：${ble.error}`);
  }, [ble.error, ble.state, showToast]);

  const connection =
    ble.state === "connected"
      ? { label: "已连接", dot: "bg-[#28a948]" }
      : ble.state === "requesting" || ble.state === "connecting"
        ? { label: "连接中", dot: "bg-[#ffb200]" }
        : ble.state === "reconnecting"
          ? { label: "重连中", dot: "bg-[#ffb200]" }
          : ble.state === "error" && ble.error?.includes("蓝牙适配器")
            ? { label: "无蓝牙", dot: "bg-[#fc0035]" }
            : ble.state === "disconnected" || ble.state === "error"
              ? { label: "断开", dot: "bg-[#fc0035]" }
              : ble.state === "unsupported"
                ? { label: "不支持蓝牙", dot: "bg-[#fc0035]" }
                : { label: "未连接", dot: "bg-[#8f8f8f]" };

  const hint = modelError
    ? "3D 模型加载失败；刷新页面重试。"
    : ble.state === "unsupported"
      ? "当前浏览器不支持 Web Bluetooth；请用 Chrome/Edge 打开。"
      : ble.state === "connected" && metrics.stale
        ? "数据中断，模型已冻结；等待下一帧…"
        : ble.state === "requesting"
          ? "正在打开蓝牙选择器…"
          : ble.state === "connecting"
            ? "正在连接 SleepPosture…"
            : ble.state === "reconnecting"
              ? "连接中断，正在自动重连…"
              : ble.state === "connected"
                ? "直连中。直接转动板子，模型会跟着动；方向反了用「翻转 180°」；HEAD 朝屏幕远端后归零。"
                : ble.state === "error" || ble.state === "disconnected"
                  ? ble.error
                    ? `${ble.error}；点「连接 BLE」重试。`
                    : "已断开；点「连接 BLE」重连。"
                  : "点「连接 BLE」直连 SleepPosture；不需要配对。";

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-[13px] focus:text-white"
      >
        跳到主要内容
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1500px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-[5px] bg-black text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M4.2 15.6c3.4-6.4 11.8-8.3 16.2-3.3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <circle cx="7.1" cy="8.1" r="2.1" fill="currentColor" />
              </svg>
            </span>
            <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#171717]">
              SleepPosture
              <span className="ml-1.5 rounded border border-border px-1 py-0.5 align-[2px] font-mono text-[9px] font-medium tracking-normal text-[#8f8f8f]">
                3D
              </span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              aria-live="polite"
              className="hidden items-center gap-2 rounded-full border border-border bg-white px-2.5 py-1 text-[12px] leading-4 text-[#4d4d4d] sm:inline-flex"
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${connection.dot}`}
              />
              {connection.label}
            </span>
            <Button
              variant={ble.connected ? "secondary" : "primary"}
              size="sm"
              disabled={
                ble.state === "requesting" ||
                ble.state === "connecting" ||
                ble.state === "unsupported"
              }
              onClick={() => {
                if (ble.connected || ble.state === "reconnecting") {
                  void disconnectBle();
                } else {
                  void connectBle();
                }
              }}
            >
              {ble.connected
                ? "断开"
                : ble.state === "reconnecting"
                  ? "停止重连"
                  : ble.state === "requesting" || ble.state === "connecting"
                    ? "连接中…"
                    : ble.state === "unsupported"
                      ? "不支持蓝牙"
                      : "连接 BLE"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSettingsOpen(true)}
            >
              设置
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main"
        className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start"
      >
        <section
          aria-label="实时 3D 预览"
          className="relative aspect-[4/3] overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#0a0a0a] lg:sticky lg:top-[88px] lg:aspect-auto lg:h-[calc(100dvh-112px)] lg:min-h-[520px]"
        >
          <BoardScene
            engine={engine}
            sceneApiRef={sceneApiRef}
            onLoaded={() => setModelLoaded(true)}
            onError={(message) => {
              setModelError(message);
              setModelLoaded(true);
            }}
          />

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-4">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-white/55">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${connection.dot}`}
              />
              实时 3D
            </div>
            <span className="hidden font-mono text-[10px] tracking-[0.02em] text-white/35 sm:block">
              拖拽旋转 · 滚轮缩放
            </span>
          </div>

          <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex items-center gap-2 font-mono text-[10px] tracking-[0.04em] text-white/45">
            <span>BMI220</span>
            <span className="text-white/20">/</span>
            <span>
              {metrics.demo
                ? "DEMO"
                : rate > 0
                  ? `${rate.toFixed(0)} Hz`
                  : "WAIT"}
            </span>
          </div>

          {!modelLoaded ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#0a0a0a]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : null}

          {modelError ? (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#0a0a0a] px-6 text-center">
              <div>
                <p className="text-[13px] leading-5 text-white/70">
                  {modelError}
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-3 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-white/15"
                >
                  重新加载
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <Sidebar
          metrics={metrics}
          rate={rate}
          deviceName={ble.name}
          headingLock={headingLock}
          hint={hint}
          onboardingOpen={onboardingOpen}
          onModeChange={handleMode}
          onFlip={handleFlip}
          onZero={handleZero}
          onResetView={handleResetView}
          onDemo={handleDemo}
          onSettings={() => setSettingsOpen(true)}
          onOnboardingClose={handleOnboardingClose}
          onOnboardingFlip={handleFlip}
        />
      </main>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        orientation={orientation}
        yaw={yaw}
        testPose={testPose}
        metrics={metrics}
        onOrientationChange={handleOrientation}
        onYawChange={handleYaw}
        onToggleTestPose={handleToggleTestPose}
        onResetDirection={handleResetDirection}
        onCalibrate={() => {
          setSettingsOpen(false);
          setCalibrationOpen(true);
        }}
      />

      <CalibrationDialog
        open={calibrationOpen}
        onClose={() => setCalibrationOpen(false)}
        engine={engine}
        onApplied={handleCalibrationApplied}
      />

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[60] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-md bg-[#171717] px-3.5 py-2 text-[12px] leading-4 text-white shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
