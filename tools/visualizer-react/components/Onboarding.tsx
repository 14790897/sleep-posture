"use client";

import { Button } from "@/components/ui";

export function Onboarding({
  onFlip,
  onClose,
}: {
  onFlip: () => void;
  onClose: () => void;
}) {
  return (
    <section
      aria-label="上手提示"
      className="border-t border-border bg-[#fafafa] px-5 py-4"
    >
      <div className="flex gap-3">
        <svg
          viewBox="0 0 46 78"
          aria-hidden="true"
          className="h-[64px] w-[38px] shrink-0"
        >
          <rect
            x="8"
            y="18"
            width="30"
            height="54"
            rx="5"
            fill="#ffffff"
            stroke="#171717"
            strokeWidth="1.4"
          />
          <rect
            x="2"
            y="26"
            width="8"
            height="16"
            rx="2"
            fill="#f2f2f2"
            stroke="#8f8f8f"
          />
          <line
            x1="8"
            y1="18"
            x2="38"
            y2="18"
            stroke="#0070f7"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <line
            x1="23"
            y1="15"
            x2="23"
            y2="5"
            stroke="#0070f7"
            strokeWidth="1.2"
          />
          <polygon points="23,1 20,9 26,9" fill="#0070f7" />
          <rect x="14" y="64" width="8" height="4" rx="1" fill="#d4d4d4" />
          <rect x="24" y="64" width="8" height="4" rx="1" fill="#d4d4d4" />
        </svg>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-5 text-foreground">
            拿起板子，转动它
          </p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[#4d4d4d]">
            方向对不上时，把板子像手机一样平放在桌上，让{" "}
            <span className="font-mono text-[11px] text-foreground">
              HEAD
            </span>{" "}
            （印着 TOP/HEAD 的短边）朝屏幕远端，点「归零」。
          </p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[#8f8f8f]">
            如果整体反了 180°，用「翻转 180°」；不对再点一次。
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={onFlip}>
              翻转 180°
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              知道了
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
