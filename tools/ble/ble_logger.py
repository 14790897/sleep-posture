#!/usr/bin/env python3
"""连接 SleepPosture 设备，记录 IMU 原始帧与姿态标签到 CSV。

用法示例：
  python tools/ble_logger.py --out data/raw/night01.csv \
      --schedule "supine=300,prone=300,left=300,right=300"

依赖：bleak
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import datetime as dt
import struct
import sys
import time
from pathlib import Path

from bleak import BleakClient, BleakScanner

SERVICE_UUID = "b7a10001-4c3d-4e2f-9a8b-1c2d3e4f5a60"
CONTROL_UUID = "b7a10002-4c3d-4e2f-9a8b-1c2d3e4f5a60"
DATA_UUID = "b7a10003-4c3d-4e2f-9a8b-1c2d3e4f5a60"
STATUS_UUID = "b7a10004-4c3d-4e2f-9a8b-1c2d3e4f5a60"

FRAME_FMT = "<BBHIhhhhhhBBBB"
FRAME_LEN = struct.calcsize(FRAME_FMT)
STATUS_FMT = "<BBBBBBHI"
STATUS_LEN = struct.calcsize(STATUS_FMT)

LABELS = {"unknown": 0, "supine": 1, "prone": 2, "left": 3, "right": 4, "moving": 5}

CSV_FIELDS = [
    "host_time",
    "host_unix_ms",
    "seq",
    "t_ms",
    "ax_mg",
    "ay_mg",
    "az_mg",
    "gx_ddps",
    "gy_ddps",
    "gz_ddps",
    "posture",
    "posture_name",
    "confidence",
    "battery",
    "flags",
    "crc_ok",
    "label_id",
    "label_name",
]


def crc8(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def parse_schedule(text: str) -> list[tuple[int, int]]:
    """'supine=300,prone=300' -> [(1,300),(2,300)]"""
    out: list[tuple[int, int]] = []
    for part in text.split(","):
        part = part.strip()
        if not part:
            continue
        name, _, secs = part.partition("=")
        name = name.strip().lower()
        if name not in LABELS:
            raise ValueError(f"unknown posture label: {name}")
        out.append((LABELS[name], int(float(secs or 300))))
    return out


class Recorder:
    def __init__(self, out_path: Path, args: argparse.Namespace):
        self.out_path = out_path
        self.args = args
        self.fh = None
        self.writer = None
        self.t0_host_ms: int | None = None
        self.t0_device_ms: int | None = None
        self.last_status: tuple | None = None
        self.last_print = 0.0
        self.rows = 0
        self.bad_crc = 0
        self.label_id = 0
        self.label_name = ""

    def open(self) -> None:
        self.out_path.parent.mkdir(parents=True, exist_ok=True)
        self.fh = self.out_path.open("w", newline="", encoding="utf-8")
        self.writer = csv.DictWriter(self.fh, fieldnames=CSV_FIELDS)
        self.writer.writeheader()

    def close(self) -> None:
        if self.fh:
            self.fh.flush()
            self.fh.close()
            self.fh = None

    def on_data(self, _sender, data: bytearray) -> None:
        if len(data) != FRAME_LEN:
            return
        (
            version,
            flags,
            seq,
            t_ms,
            ax,
            ay,
            az,
            gx,
            gy,
            gz,
            posture,
            confidence,
            battery,
            crc,
        ) = struct.unpack(FRAME_FMT, data)
        ok = crc8(bytes(data[:23])) == crc
        if not ok:
            self.bad_crc += 1
            if not self.args.keep_bad:
                return

        now_unix_ms = int(time.time() * 1000)
        if self.t0_host_ms is None:
            self.t0_host_ms = now_unix_ms
            self.t0_device_ms = t_ms
            print(
                f"first frame: session t={t_ms} ms, device->host offset "
                f"{now_unix_ms - t_ms} ms"
            )

        self.writer.writerow(
            {
                "host_time": dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds"),
                "host_unix_ms": now_unix_ms,
                "seq": seq,
                "t_ms": t_ms,
                "ax_mg": ax,
                "ay_mg": ay,
                "az_mg": az,
                "gx_ddps": gx,
                "gy_ddps": gy,
                "gz_ddps": gz,
                "posture": posture,
                "posture_name": next(
                    (k for k, v in LABELS.items() if v == posture), "unknown"
                ),
                "confidence": confidence,
                "battery": battery,
                "flags": flags,
                "crc_ok": int(ok),
                "label_id": self.label_id,
                "label_name": self.label_name,
            }
        )
        self.rows += 1
        if self.rows % 500 == 0:
            print(
                f"rows={self.rows} last_posture={posture} conf={confidence} "
                f"vbat={battery}% bad_crc={self.bad_crc}"
            )

    def on_status(self, _sender, data: bytearray) -> None:
        if len(data) != STATUS_LEN:
            return
        st = struct.unpack(STATUS_FMT, data)
        self.last_status = st
        now = time.monotonic()
        if now - self.last_print >= 10:
            self.last_print = now
            print(
                f"status: posture={st[2]} conf={st[3]} battery={st[1]}% "
                f"session={st[6]} uptime={st[7]}s"
            )

    async def run_schedule(self, client: BleakClient, schedule, duration: int) -> None:
        start = time.monotonic()
        for label_id, secs in schedule:
            if duration and time.monotonic() - start >= duration:
                break
            self.label_id = label_id
            self.label_name = next((k for k, v in LABELS.items() if v == label_id), "unknown")
            await client.write_gatt_char(CONTROL_UUID, bytes([0x07, label_id]), response=False)
            print(f"label -> {self.label_name} for {secs}s")
            wait = secs
            if duration:
                wait = min(wait, max(0.0, duration - (time.monotonic() - start)))
            await asyncio.sleep(wait)
        if duration:
            remaining = duration - (time.monotonic() - start)
            if remaining > 0:
                await asyncio.sleep(remaining)


async def find_device(args: argparse.Namespace):
    if args.address:
        return await BleakScanner.find_device_by_address(args.address, timeout=args.scan_timeout)

    def match(device, adv_data) -> bool:
        uuids = [u.lower() for u in (adv_data.service_uuids or [])]
        name = (adv_data.local_name or device.name or "")
        return SERVICE_UUID in uuids or name.startswith(args.name)

    return await BleakScanner.find_device_by_filter(match, timeout=args.scan_timeout)


async def run(args: argparse.Namespace) -> int:
    device = await find_device(args)
    if device is None:
        print("device not found; check power and advertising name", file=sys.stderr)
        return 1

    print(f"connecting to {device.name or device.address} ...")
    rec = Recorder(Path(args.out), args)
    rec.open()
    try:
        async with BleakClient(device, timeout=20) as client:
            print(f"connected: mtu={client.mtu_size}")
            if client.mtu_size < 27:
                print(
                    "WARNING: ATT MTU < 27; a 24-byte frame needs MTU >= 27. "
                    "Data notifications may be dropped. Try reconnecting or a different host adapter.",
                    file=sys.stderr,
                )
            await client.start_notify(DATA_UUID, rec.on_data)
            await client.start_notify(STATUS_UUID, rec.on_status)
            await client.write_gatt_char(
                CONTROL_UUID, bytes([0x01, max(1, min(50, args.rate))]), response=False
            )
            if args.calibrate:
                print("gyro calibration: keep the device still for 3s ...")
                await client.write_gatt_char(CONTROL_UUID, bytes([0x03]), response=False)
                await asyncio.sleep(3.0)

            schedule = parse_schedule(args.schedule) if args.schedule else []
            if schedule:
                await rec.run_schedule(client, schedule, args.duration)
            elif args.duration:
                await asyncio.sleep(args.duration)
            else:
                print("streaming; Ctrl-C to stop")
                while True:
                    await asyncio.sleep(1.0)
    except asyncio.CancelledError:
        pass
    except KeyboardInterrupt:
        pass
    finally:
        rec.close()
        print(f"saved {rec.rows} rows to {rec.out_path} (bad_crc={rec.bad_crc})")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name", default="SleepPosture", help="advertising name prefix")
    ap.add_argument("--address", default=None, help="BLE address (skip scanning by name)")
    ap.add_argument("--scan-timeout", type=float, default=10.0)
    ap.add_argument("--out", default="data/raw/session.csv")
    ap.add_argument("--schedule", default="", help="e.g. supine=300,prone=300,left=300,right=300")
    ap.add_argument("--duration", type=int, default=0, help="total seconds; 0 = until Ctrl-C")
    ap.add_argument("--rate", type=int, default=50, help="notification rate in Hz (1-50)")
    ap.add_argument("--calibrate", action="store_true", help="request gyro bias calibration first")
    ap.add_argument("--keep-bad", action="store_true", help="write rows with bad CRC")
    args = ap.parse_args()

    try:
        return asyncio.run(run(args))
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
