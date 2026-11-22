"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { PoseEngine, PoseMetrics } from "@/lib/pose-engine";

export const BLE_SERVICE = "b7a10001-4c3d-4e2f-9a8b-1c2d3e4f5a60";
export const BLE_CONTROL = "b7a10002-4c3d-4e2f-9a8b-1c2d3e4f5a60";
export const BLE_DATA = "b7a10003-4c3d-4e2f-9a8b-1c2d3e4f5a60";
export const BLE_STATUS = "b7a10004-4c3d-4e2f-9a8b-1c2d3e4f5a60";

export type BleState =
  | "idle"
  | "requesting"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "disconnected"
  | "error"
  | "unsupported";

export type BleInfo = {
  state: BleState;
  connected: boolean;
  name: string;
  error: string | null;
};

type GattHandles = {
  data: BluetoothRemoteGATTCharacteristic;
  status: BluetoothRemoteGATTCharacteristic;
  control: BluetoothRemoteGATTCharacteristic;
  onData: (event: Event) => void;
  onStatus: (event: Event) => void;
};

// 25 Hz avoids Windows Web Bluetooth notification drops seen at 50 Hz;
// the firmware accepts 1–50 Hz and derives its notify divider from this byte.
const STREAM_RATE = 25;
const START_STREAM = new Uint8Array([0x01, STREAM_RATE]);

function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc;
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

export function useBle(engine: PoseEngine) {
  const [info, setInfo] = useState<BleInfo>({
    state: "idle",
    connected: false,
    name: "",
    error: null,
  });
  const [rate, setRate] = useState(0);
  const [metrics, setMetrics] = useState<PoseMetrics>(() =>
    engine.getMetrics(false),
  );

  const infoRef = useRef(info);
  infoRef.current = info;
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const handlesRef = useRef<GattHandles | null>(null);
  const manualReleaseRef = useRef(false);
  const reconnectTimerRef = useRef<number | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const connectedAtRef = useRef(0);
  const rateAtRef = useRef(0);
  const rateFramesRef = useRef(0);
  const watchdogAtRef = useRef(0);

  const releaseHandles = useCallback(async () => {
    const handles = handlesRef.current;
    handlesRef.current = null;
    if (!handles) return;
    handles.data.removeEventListener(
      "characteristicvaluechanged",
      handles.onData,
    );
    handles.status.removeEventListener(
      "characteristicvaluechanged",
      handles.onStatus,
    );
    await handles.data.stopNotifications().catch(() => {});
    await handles.status.stopNotifications().catch(() => {});
  }, []);

  const writeStartStream = useCallback(
    async (control: BluetoothRemoteGATTCharacteristic) => {
      try {
        if (typeof control.writeValueWithResponse === "function") {
          await control.writeValueWithResponse(START_STREAM);
        } else {
          await control.writeValue(START_STREAM);
        }
      } catch {
        await control.writeValue(START_STREAM).catch(() => {});
      }
    },
    [],
  );

  const openGatt = useCallback(
    async (device: BluetoothDevice, reconnect: boolean) => {
      const server = await device.gatt?.connect();
      if (!server) throw new Error("无法连接 GATT server");

      const service = await server.getPrimaryService(BLE_SERVICE);
      const data = await service.getCharacteristic(BLE_DATA);
      const status = await service.getCharacteristic(BLE_STATUS);
      const control = await service.getCharacteristic(BLE_CONTROL);

      const onData = (event: Event) => {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value || value.byteLength !== 24) return;
        const view = new DataView(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        );
        const crc = view.getUint8(23);
        const crcOk =
          crc8(new Uint8Array(value.buffer, value.byteOffset, 23)) === crc;
        engine.feed({
          seq: view.getUint16(2, true),
          ax: view.getInt16(8, true) / 1000,
          ay: view.getInt16(10, true) / 1000,
          az: view.getInt16(12, true) / 1000,
          gx: view.getInt16(14, true) / 10,
          gy: view.getInt16(16, true) / 10,
          gz: view.getInt16(18, true) / 10,
          posture: view.getUint8(20),
          confidence: view.getUint8(21),
          battery: view.getUint8(22),
          crcOk,
        });
      };

      const onStatus = (event: Event) => {
        const characteristic = event.target as BluetoothRemoteGATTCharacteristic;
        const value = characteristic.value;
        if (!value || value.byteLength !== 12) return;
        const view = new DataView(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        );
        engine.applyStatus({
          battery: view.getUint8(1),
          posture: view.getUint8(2),
          confidence: view.getUint8(3),
          reserved: view.getUint8(5),
          session: view.getUint16(6, true),
          uptime: view.getUint32(8, true),
        });
      };

      await data.startNotifications();
      data.addEventListener("characteristicvaluechanged", onData);
      await status.startNotifications();
      status.addEventListener("characteristicvaluechanged", onStatus);

      handlesRef.current = { data, status, control, onData, onStatus };
      await writeStartStream(control);

      if (!reconnect) engine.resetFilter();
      engine.setStreamRate(STREAM_RATE);
      engine.resetSequence();
      connectedAtRef.current = performance.now();
      rateAtRef.current = performance.now();
      rateFramesRef.current = engine.frameCount;
      reconnectAttemptsRef.current = 0;
      setInfo({
        state: "connected",
        connected: true,
        name: device.name || "SleepPosture",
        error: null,
      });
    },
    [engine, writeStartStream],
  );

  const scheduleReconnect = useCallback(() => {
    if (manualReleaseRef.current || !deviceRef.current) return;
    window.clearTimeout(reconnectTimerRef.current);
    const delay = Math.min(5000, 400 * 2 ** reconnectAttemptsRef.current);
    reconnectAttemptsRef.current += 1;
    reconnectTimerRef.current = window.setTimeout(async () => {
      const device = deviceRef.current;
      if (!device || manualReleaseRef.current) return;
      setInfo({
        state: "reconnecting",
        connected: false,
        name: device.name || "",
        error: null,
      });
      try {
        await releaseHandles();
        await openGatt(device, true);
      } catch {
        scheduleReconnect();
      }
    }, delay);
  }, [openGatt, releaseHandles]);

  const handleDisconnected = useCallback(() => {
    if (manualReleaseRef.current) return;
    void releaseHandles();
    setInfo({
      state: "reconnecting",
      connected: false,
      name: "",
      error: "连接中断，正在自动重连…",
    });
    scheduleReconnect();
  }, [releaseHandles, scheduleReconnect]);
  const disconnectHandlerRef = useRef(handleDisconnected);
  disconnectHandlerRef.current = handleDisconnected;
  const onDisconnected = useCallback(() => {
    disconnectHandlerRef.current();
  }, []);

  const cleanupGatt = useCallback(async () => {
    await releaseHandles();
    const device = deviceRef.current;
    deviceRef.current = null;
    if (device) {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
      if (device.gatt?.connected) device.gatt.disconnect();
    }
  }, [onDisconnected, releaseHandles]);

  const connect = useCallback(async () => {
    if (!("bluetooth" in navigator)) {
      setInfo({
        state: "unsupported",
        connected: false,
        name: "",
        error: "当前浏览器不支持 Web Bluetooth",
      });
      return;
    }
    if (infoRef.current.state === "requesting") return;

    if (typeof navigator.bluetooth.getAvailability === "function") {
      try {
        if (!(await navigator.bluetooth.getAvailability())) {
          setInfo({
            state: "error",
            connected: false,
            name: "",
            error:
              "未检测到可用的蓝牙适配器：请插回 USB 蓝牙适配器、在 Windows 设置中打开蓝牙，并允许 Chrome 使用蓝牙后重试",
          });
          return;
        }
      } catch {
        // getAvailability is optional; fall through to requestDevice.
      }
    }

    manualReleaseRef.current = false;
    window.clearTimeout(reconnectTimerRef.current);
    await cleanupGatt();
    setInfo({
      state: "requesting",
      connected: false,
      name: "",
      error: null,
    });

    try {
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [BLE_SERVICE],
      });
      deviceRef.current = device;
      device.addEventListener("gattserverdisconnected", onDisconnected);
      setInfo({
        state: "connecting",
        connected: false,
        name: device.name || "SleepPosture",
        error: null,
      });
      await openGatt(device, false);
    } catch (error) {
      await cleanupGatt();
      if (
        error instanceof DOMException &&
        (error.name === "NotFoundError" || error.name === "AbortError")
      ) {
        setInfo({
          state: "idle",
          connected: false,
          name: "",
          error: "已取消或没有找到设备",
        });
      } else {
        setInfo({
          state: "error",
          connected: false,
          name: "",
          error: errorText(error),
        });
      }
    }
  }, [cleanupGatt, onDisconnected, openGatt]);

  const disconnect = useCallback(async () => {
    manualReleaseRef.current = true;
    window.clearTimeout(reconnectTimerRef.current);
    reconnectAttemptsRef.current = 0;
    await cleanupGatt();
    setInfo({
      state: "idle",
      connected: false,
      name: "",
      error: null,
    });
  }, [cleanupGatt]);

  useEffect(() => {
    if (!("bluetooth" in navigator)) {
      setInfo({
        state: "unsupported",
        connected: false,
        name: "",
        error: "当前浏览器不支持 Web Bluetooth",
      });
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - rateAtRef.current) / 1000;
      if (elapsed >= 1) {
        setRate((engine.frameCount - rateFramesRef.current) / elapsed);
        rateAtRef.current = now;
        rateFramesRef.current = engine.frameCount;
      }
      startTransition(() => {
        setMetrics(engine.getMetrics(infoRef.current.connected));
      });

      if (!infoRef.current.connected) return;
      const last = Math.max(engine.lastDataAt, connectedAtRef.current);
      const staleFor = now - last;
      if (
        staleFor > 3000 &&
        handlesRef.current &&
        now - watchdogAtRef.current > 1500
      ) {
        watchdogAtRef.current = now;
        void writeStartStream(handlesRef.current.control);
      }
      if (staleFor > 8000) {
        const device = deviceRef.current;
        if (device?.gatt?.connected) {
          device.gatt.disconnect();
        } else {
          handleDisconnected();
        }
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [engine, handleDisconnected, writeStartStream]);

  useEffect(() => {
    return () => {
      manualReleaseRef.current = true;
      window.clearTimeout(reconnectTimerRef.current);
      void cleanupGatt();
    };
  }, [cleanupGatt]);

  return { info, rate, metrics, connect, disconnect };
}
