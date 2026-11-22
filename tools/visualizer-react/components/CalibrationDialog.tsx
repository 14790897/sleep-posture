"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  computeCalibration,
  staticBoard90,
  type PoseEngine,
} from "@/lib/pose-engine";
import { Button, Dialog } from "@/components/ui";

type Pose = "flat" | "head" | "right" | "done";

const STEP_INFO: Record<
  number,
  { title: string; desc: string; pose: Pose }
> = {
  1: {
    title: "1 / 3 · 把板子放平",
    desc: "像放手机一样：有黑色芯片和白色插座的一面朝上，整块板子贴在桌面上，不要拿在手里。HEAD 是板上印着 TOP/HEAD 的那条短边（没有接口的那头），让它朝屏幕远端、远离你。",
    pose: "flat",
  },
  2: {
    title: "2 / 3 · 垫高 HEAD 那头",
    desc: "HEAD 是印着 TOP/HEAD 的那条短边（没有接口）。把它像垫书一样翘起来，和桌面成 30–60°，另一头留在桌面上；不要抬有两个白色插座的那头。",
    pose: "head",
  },
  3: {
    title: "3 / 3 · 垫高右边",
    desc: "把板子放回桌面，有黑色芯片的一面朝上，HEAD 朝前（远离你）。抬起你右手边那条长边 30–60°，左手边留在桌面上。",
    pose: "right",
  },
  4: {
    title: "完成",
    desc: "校准已保存。把板子放平、HEAD 朝屏幕远端；如果模型方向与实物不一致，点「归零」，再倾斜验证。",
    pose: "done",
  },
};

type CalibState = {
  flat: THREE.Vector3 | null;
  head: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  holdRef: THREE.Vector3 | null;
  holdAngle: number | null;
  stableMs: number;
};

function CalibDiagram({ pose }: { pose: Pose }) {
  if (pose === "flat") {
    return (
      <svg viewBox="0 0 260 180" aria-hidden="true" className="h-full w-full">
        <rect
          x="95"
          y="30"
          width="70"
          height="125"
          rx="8"
          fill="#ffffff"
          stroke="#171717"
          strokeWidth="1.6"
        />
        <rect
          x="84"
          y="44"
          width="20"
          height="34"
          rx="3"
          fill="#f2f2f2"
          stroke="#8f8f8f"
        />
        <rect x="80" y="52" width="8" height="18" rx="2" fill="#d4d4d4" />
        <text x="74" y="40" fill="#8f8f8f" fontSize="8.5" textAnchor="middle">
          模组 USB
        </text>
        <line
          x1="95"
          y1="30"
          x2="165"
          y2="30"
          stroke="#0070f7"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <text
          x="130"
          y="17"
          fill="#0070f7"
          fontSize="11"
          fontWeight="700"
          textAnchor="middle"
        >
          HEAD / TOP
        </text>
        <text x="130" y="8" fill="#8f8f8f" fontSize="8" textAnchor="middle">
          这条短边没有接口
        </text>
        <rect x="105" y="150" width="18" height="8" rx="2" fill="#d4d4d4" />
        <rect x="137" y="150" width="18" height="8" rx="2" fill="#d4d4d4" />
        <text
          x="130"
          y="171"
          fill="#8f8f8f"
          fontSize="8.5"
          textAnchor="middle"
        >
          接口在下边 · 你在这侧
        </text>
        <text x="176" y="96" fill="#171717" fontSize="9" fontWeight="700">
          右手边
        </text>
        <line x1="172" y1="92" x2="167" y2="92" stroke="#171717" strokeWidth="1.2" />
        <polygon points="163,92 170,88 170,96" fill="#171717" />
      </svg>
    );
  }

  if (pose === "head") {
    return (
      <svg viewBox="0 0 260 180" aria-hidden="true" className="h-full w-full">
        <line
          x1="38"
          y1="146"
          x2="222"
          y2="146"
          stroke="#eaeaea"
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <line
          x1="62"
          y1="132"
          x2="188"
          y2="82"
          stroke="#171717"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <line
          x1="62"
          y1="132"
          x2="188"
          y2="82"
          stroke="#ffffff"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <text x="202" y="73" fill="#0070f7" fontSize="11" fontWeight="700">
          HEAD
        </text>
        <text x="202" y="85" fill="#8f8f8f" fontSize="8.5">
          抬起这一端
        </text>
        <line x1="188" y1="76" x2="188" y2="48" stroke="#0070f7" strokeWidth="1.2" />
        <polygon points="188,42 184,52 192,52" fill="#0070f7" />
        <path
          d="M 78 128 A 52 52 0 0 1 94 96"
          fill="none"
          stroke="#171717"
          strokeWidth="1.3"
        />
        <text x="98" y="110" fill="#171717" fontSize="9" fontWeight="600">
          30–60°
        </text>
        <text x="52" y="147" fill="#8f8f8f" fontSize="9" textAnchor="middle">
          有接口的那头
        </text>
      </svg>
    );
  }

  if (pose === "right") {
    return (
      <svg viewBox="0 0 260 180" aria-hidden="true" className="h-full w-full">
        <line
          x1="38"
          y1="168"
          x2="222"
          y2="168"
          stroke="#eaeaea"
          strokeWidth="1.4"
          strokeDasharray="4 4"
        />
        <polygon
          points="58,126 188,82 188,128 58,172"
          fill="#ffffff"
          stroke="#171717"
          strokeWidth="2"
        />
        <rect
          x="76"
          y="118"
          width="26"
          height="16"
          rx="3"
          fill="#f2f2f2"
          stroke="#8f8f8f"
          transform="rotate(-18 76 118)"
        />
        <rect
          x="70"
          y="123"
          width="8"
          height="12"
          rx="2"
          fill="#d4d4d4"
          transform="rotate(-18 70 123)"
        />
        <line
          x1="188"
          y1="82"
          x2="188"
          y2="128"
          stroke="#0070f7"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <text x="202" y="86" fill="#0070f7" fontSize="11" fontWeight="700">
          右手边
        </text>
        <text x="202" y="98" fill="#8f8f8f" fontSize="8.5">
          抬起这一端
        </text>
        <line x1="188" y1="82" x2="188" y2="54" stroke="#0070f7" strokeWidth="1.2" />
        <polygon points="188,48 184,58 192,58" fill="#0070f7" />
        <text x="48" y="154" fill="#8f8f8f" fontSize="9" textAnchor="middle">
          左手边
        </text>
        <text
          x="123"
          y="164"
          fill="#8f8f8f"
          fontSize="8.5"
          textAnchor="middle"
        >
          从元件面看 · HEAD 朝里
        </text>
        <path
          d="M 78 124 A 52 52 0 0 1 100 96"
          fill="none"
          stroke="#171717"
          strokeWidth="1.3"
        />
        <text x="102" y="110" fill="#171717" fontSize="9" fontWeight="600">
          30–60°
        </text>
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 260 180" aria-hidden="true" className="h-full w-full">
      <circle cx="130" cy="78" r="38" fill="none" stroke="#0070f7" strokeWidth="3" />
      <path
        d="M110 80 L124 94 L152 64"
        fill="none"
        stroke="#0070f7"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        x="130"
        y="142"
        fill="#171717"
        fontSize="12"
        fontWeight="600"
        textAnchor="middle"
      >
        方向已锁定
      </text>
    </svg>
  );
}

export function CalibrationDialog({
  open,
  onClose,
  engine,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  engine: PoseEngine;
  onApplied: () => void;
}) {
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState("把板子放平，等待稳定…");
  const [angleText, setAngleText] = useState("--");
  const [progress, setProgress] = useState(0);
  const [tone, setTone] = useState<"good" | "bad" | undefined>(undefined);
  const stepRef = useRef(1);
  const calibRef = useRef<CalibState>({
    flat: null,
    head: null,
    right: null,
    holdRef: null,
    holdAngle: null,
    stableMs: 0,
  });

  const resetHold = () => {
    calibRef.current.holdRef = null;
    calibRef.current.holdAngle = null;
    calibRef.current.stableMs = 0;
  };

  const resetWizard = () => {
    stepRef.current = 1;
    setStep(1);
    calibRef.current = {
      flat: null,
      head: null,
      right: null,
      holdRef: null,
      holdAngle: null,
      stableMs: 0,
    };
    setStatus("把板子放平，等待稳定…");
    setAngleText("--");
    setProgress(0);
    setTone(undefined);
  };

  useEffect(() => {
    if (!open) return;
    resetWizard();

    const timer = window.setInterval(() => {
      const current = stepRef.current;
      if (current < 1 || current > 3) return;
      if (
        !engine.lastDataAt ||
        performance.now() - engine.lastDataAt > 600
      ) {
        resetHold();
        setStatus("等待 BLE 数据…");
        setAngleText("--");
        setProgress(0);
        return;
      }

      const accel = engine.rawAccel.clone();
      if (accel.lengthSq() < 0.2) return;
      accel.normalize();
      const gyroMag = engine.gyro.length();

      if (current === 1) {
        const flatness = accel.z;
        const tiltDeg = (Math.acos(Math.max(-1, Math.min(1, flatness))) * 180) / Math.PI;
        if (flatness < 0.92) {
          resetHold();
          setStatus(
            `先放平：有黑色芯片的一面朝上，当前倾斜 ${tiltDeg.toFixed(0)}°`,
          );
          setAngleText(`${tiltDeg.toFixed(0)}°`);
          setProgress(0);
          setTone(undefined);
          return;
        }

        const state = calibRef.current;
        if (state.holdRef === null) {
          state.holdRef = accel.clone();
          state.stableMs = 0;
        } else if (
          accel.angleTo(state.holdRef) > THREE.MathUtils.degToRad(2.5) ||
          gyroMag > 6
        ) {
          state.holdRef = accel.clone();
          state.stableMs = 0;
        } else {
          state.stableMs += 50;
        }

        setStatus(
          `平放保持 ${(state.stableMs / 1000).toFixed(1)} / 1.2 s`,
        );
        setAngleText("水平");
        setProgress(state.stableMs / 1200);
        setTone("good");

        if (state.stableMs >= 1200) {
          state.flat = accel.clone();
          stepRef.current = 2;
          setStep(2);
          resetHold();
          setStatus("把 HEAD 短边抬起 30–60°");
          setAngleText("--");
          setProgress(0);
          setTone(undefined);
        }
        return;
      }

      const flat = calibRef.current.flat;
      if (!flat) {
        stepRef.current = 1;
        setStep(1);
        return;
      }

      const angleDeg = (accel.angleTo(flat) * 180) / Math.PI;
      const [bx, by] = staticBoard90(accel.x, accel.y, accel.z);

      if (current === 2) {
        if (angleDeg < 25) {
          resetHold();
          setStatus(
            `再抬高一点：当前 ${angleDeg.toFixed(0)}°（目标 30–60°）`,
          );
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone(undefined);
          return;
        }
        if (angleDeg > 70) {
          resetHold();
          setStatus(
            `抬太高了：当前 ${angleDeg.toFixed(0)}°，降到 30–60°`,
          );
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone(undefined);
          return;
        }
        if (by < 0.25) {
          resetHold();
          setStatus("方向反了：抬 HEAD 短边，不是有白色插座的那头");
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone("bad");
          return;
        }

        const state = calibRef.current;
        if (state.holdAngle === null) {
          state.holdAngle = angleDeg;
          state.stableMs = 0;
        } else if (
          Math.abs(angleDeg - state.holdAngle) > 5 ||
          gyroMag > 6
        ) {
          state.holdAngle = angleDeg;
          state.stableMs = 0;
        } else {
          state.stableMs += 50;
        }

        setStatus(
          `保持 HEAD 抬起：${(state.stableMs / 1000).toFixed(1)} / 0.8 s`,
        );
        setAngleText(`${angleDeg.toFixed(0)}°`);
        setProgress(state.stableMs / 800);
        setTone("good");

        if (state.stableMs >= 800) {
          state.head = accel.clone();
          stepRef.current = 3;
          setStep(3);
          resetHold();
          setStatus("把右手边抬起 30–60°");
          setAngleText("--");
          setProgress(0);
          setTone(undefined);
        }
        return;
      }

      if (current === 3) {
        if (angleDeg < 25) {
          resetHold();
          setStatus(
            `再抬高一点：当前 ${angleDeg.toFixed(0)}°（目标 30–60°）`,
          );
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone(undefined);
          return;
        }
        if (angleDeg > 70) {
          resetHold();
          setStatus(
            `抬太高了：当前 ${angleDeg.toFixed(0)}°，降到 30–60°`,
          );
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone(undefined);
          return;
        }
        if (bx < 0.25) {
          resetHold();
          setStatus("方向反了：抬你右手边，不是左手边");
          setAngleText(`${angleDeg.toFixed(0)}°`);
          setProgress(0);
          setTone("bad");
          return;
        }

        const state = calibRef.current;
        if (state.holdAngle === null) {
          state.holdAngle = angleDeg;
          state.stableMs = 0;
        } else if (
          Math.abs(angleDeg - state.holdAngle) > 5 ||
          gyroMag > 6
        ) {
          state.holdAngle = angleDeg;
          state.stableMs = 0;
        } else {
          state.stableMs += 50;
        }

        setStatus(
          `保持右手边抬起：${(state.stableMs / 1000).toFixed(1)} / 0.8 s`,
        );
        setAngleText(`${angleDeg.toFixed(0)}°`);
        setProgress(state.stableMs / 800);
        setTone("good");

        if (state.stableMs >= 800) {
          if (!state.flat || !state.head) {
            stepRef.current = 1;
            setStep(1);
            setStatus("校准状态丢失，请从平放重新开始");
            setTone(undefined);
            setProgress(0);
            resetHold();
            return;
          }
          state.right = accel.clone();
          const rows = computeCalibration(
            state.flat,
            state.head,
            state.right,
          );
          if (!rows) {
            stepRef.current = 0;
            setStep(0);
            setStatus("校准失败：三次姿势不一致或倾角太小，点「重来」");
            setTone("bad");
            setProgress(0);
            return;
          }
          engine.setCalibration(rows);
          stepRef.current = 4;
          setStep(4);
          setStatus("校准已保存 ✓");
          setAngleText("✓");
          setProgress(1);
          setTone("good");
          onApplied();
        }
      }
    }, 50);

    return () => window.clearInterval(timer);
    // The wizard reads the engine through refs and restarts only per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, engine]);

  const info = step >= 1 && step <= 4 ? STEP_INFO[step] : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={info?.title ?? "校准失败"}
      description="可选校准。每步保持一下，程序会自动识别并采样。"
      footer={
        <>
          <Button variant="ghost" onClick={resetWizard}>
            重来
          </Button>
          <Button
            variant="primary"
            disabled={step !== 4}
            onClick={onClose}
          >
            完成
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-center overflow-hidden rounded-lg border border-border bg-[#fafafa]">
          <div className="h-[190px] w-full">
            <CalibDiagram pose={info?.pose ?? "flat"} />
          </div>
        </div>

        <div className="flex gap-1.5" aria-label="校准步骤">
          {[
            { n: 1, label: "1 放平" },
            { n: 2, label: "2 垫高 HEAD" },
            { n: 3, label: "3 垫高右边" },
          ].map(({ n, label }) => {
            const active = step === n;
            const done = step === 4 || (step >= 1 && n < step);
            return (
              <span
                key={n}
                className={`flex-1 rounded-md border px-1 py-1.5 text-center text-[10.5px] font-medium ${
                  active
                    ? "border-black bg-black text-white"
                    : done
                      ? "border-[#cce7ff] bg-[#f0f7ff] text-[#0064e2]"
                      : "border-border bg-white text-[#8f8f8f]"
                }`}
              >
                {label}
              </span>
            );
          })}
        </div>

        <p className="min-h-[46px] text-[12.5px] leading-[1.6] text-[#4d4d4d]">
          {info?.desc ??
            "三次姿势不一致或倾角太小。点「重来」，每次只抬对应的一条边。"}
        </p>

        <div className="rounded-lg border border-border bg-[#fafafa] px-3 py-2.5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span
              aria-live="polite"
              className={`text-[11.5px] leading-4 ${
                tone === "bad"
                  ? "text-[#d60020]"
                  : tone === "good"
                    ? "text-[#107d32]"
                    : "text-[#4d4d4d]"
              }`}
            >
              {status}
            </span>
            <strong
              className={`font-mono text-[14px] font-medium tabular-nums ${
                tone === "bad"
                  ? "text-[#d60020]"
                  : tone === "good"
                    ? "text-[#107d32]"
                    : "text-[#171717]"
              }`}
            >
              {angleText}
            </strong>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eaeaea]">
            <div
              className="h-full rounded-full bg-[#0070f7] transition-[width] duration-75"
              style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}
