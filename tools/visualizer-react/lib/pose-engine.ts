import * as THREE from "three";

export type ImuFrame = {
  seq: number;
  ax: number;
  ay: number;
  az: number;
  gx: number;
  gy: number;
  gz: number;
  posture: number;
  confidence: number;
  battery: number;
  crcOk: boolean;
};

export type StatusFrame = {
  battery: number;
  posture: number;
  confidence: number;
  reserved: number;
  session: number;
  uptime: number;
};

export type PoseMetrics = {
  posture: number | null;
  confidence: number | null;
  battery: number | null;
  reserved: number | null;
  frames: number;
  crcErrors: number;
  seqGaps: number;
  angles: { roll: number; pitch: number } | null;
  stale: boolean;
  demo: boolean;
  connected: boolean;
};

export const POSTURE_ZH: Record<number, string> = {
  0: "未知",
  1: "仰卧",
  2: "俯卧",
  3: "左侧卧",
  4: "右侧卧",
  5: "翻身/过渡",
};

const STORAGE_CALIB = "sp.sensorToBoard.v2";
const STORAGE_CALIB_OLD = "sp.sensorToBoard";
const STORAGE_YAW = "sp.yawOffset";

export function staticBoard90(x: number, y: number, z: number): [number, number, number] {
  return [y, -x, z];
}

export function computeCalibration(
  flat: THREE.Vector3,
  head: THREE.Vector3,
  right: THREE.Vector3,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3] | null {
  if (flat.lengthSq() < 0.2 || head.lengthSq() < 0.2 || right.lengthSq() < 0.2) {
    return null;
  }
  const z = flat.clone().normalize();
  const h = head.clone().normalize();
  const r = right.clone().normalize();
  const ch = h.dot(z);
  const cr = r.dot(z);
  if (Math.sqrt(Math.max(0, 1 - ch * ch)) < 0.2) return null;
  if (Math.sqrt(Math.max(0, 1 - cr * cr)) < 0.2) return null;

  const headAxis = h.clone().sub(z.clone().multiplyScalar(ch)).normalize();
  const x = r.clone().sub(z.clone().multiplyScalar(cr)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  // Betaflight-style consistency check: both gestures must agree on the up axis.
  if (y.dot(headAxis) < 0.85) return null;

  x.crossVectors(y, z).normalize();
  y.crossVectors(z, x).normalize();
  return [x, y, z];
}

export class PoseEngine {
  orientation = 90;
  yawOffset = 0;
  headingLock = false;
  testPose = false;
  demo = true;
  sensorToBoard: THREE.Vector3[] | null = null;

  rawAccel = new THREE.Vector3(0, 0, 1);
  accelSmooth = new THREE.Vector3(0, 0, 1);
  gyro = new THREE.Vector3();
  gyroBias = new THREE.Vector3();
  private up = new THREE.Vector3(0, 0, 1);
  private q = new THREE.Quaternion();
  private qZero = new THREE.Quaternion();
  private display = new THREE.Quaternion();
  private accelSmoothInit = false;
  private imuInit = false;
  private demoTime = 0;
  private stillMs = 0;

  lastDataAt = 0;
  stale = false;
  frameCount = 0;
  crcErrors = 0;
  seqGaps = 0;
  lastSeq: number | null = null;
  seqStride = 1;

  posture: number | null = null;
  confidence: number | null = null;
  battery: number | null = null;
  reserved: number | null = null;

  constructor() {
    // Storage is hydrated after mount so server rendering and hydration agree.
  }

  hydrateFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(STORAGE_CALIB);
      if (saved) {
        const rows = JSON.parse(saved) as number[][];
        if (Array.isArray(rows) && rows.length === 3) {
          this.sensorToBoard = rows.map(
            (row) => new THREE.Vector3(row[0], row[1], row[2]),
          );
        }
      }
      const savedYaw = Number(window.localStorage.getItem(STORAGE_YAW));
      if ([0, 90, 180, 270].includes(savedYaw)) this.yawOffset = savedYaw;
      window.localStorage.removeItem(STORAGE_CALIB_OLD);
    } catch {
      this.sensorToBoard = null;
    }
  }

  mapAxis(x: number, y: number, z: number): [number, number, number] {
    switch (this.orientation) {
      case 90:
        return [y, -x, z];
      case 180:
        return [-x, -y, z];
      case 270:
        return [-y, x, z];
      default:
        return [x, y, z];
    }
  }

  toBoard(x: number, y: number, z: number): [number, number, number] {
    if (!this.sensorToBoard) return this.mapAxis(x, y, z);
    return [
      this.sensorToBoard[0].x * x + this.sensorToBoard[0].y * y + this.sensorToBoard[0].z * z,
      this.sensorToBoard[1].x * x + this.sensorToBoard[1].y * y + this.sensorToBoard[1].z * z,
      this.sensorToBoard[2].x * x + this.sensorToBoard[2].y * y + this.sensorToBoard[2].z * z,
    ];
  }

  feed(frame: ImuFrame) {
    this.rawAccel.set(frame.ax, frame.ay, frame.az);
    const [mx, my, mz] = this.toBoard(frame.ax, frame.ay, frame.az);
    const [gx, gy, gz] = this.toBoard(frame.gx, frame.gy, frame.gz);
    this.gyro.set(gx, gy, gz);

    if (this.gyro.length() < 0.6) {
      this.stillMs += 20;
      if (this.stillMs > 1500) this.gyroBias.lerp(this.gyro, 0.01);
    } else {
      this.stillMs = 0;
    }
    this.gyro.sub(this.gyroBias);

    if (!this.accelSmoothInit) {
      this.accelSmooth.set(mx, my, mz);
      this.accelSmoothInit = true;
    } else {
      this.accelSmooth.lerp(new THREE.Vector3(mx, my, mz), 0.25);
    }

    const now = performance.now();
    this.lastDataAt = now;
    this.stale = false;
    this.demo = false;

    if (!this.imuInit) {
      const measured = this.accelSmooth.clone();
      if (measured.lengthSq() > 0.01) {
        this.q.setFromUnitVectors(measured.normalize(), this.up);
        this.qZero.identity();
        this.imuInit = true;
      }
    }

    this.frameCount += 1;
    if (!frame.crcOk) this.crcErrors += 1;
    if (this.lastSeq !== null) {
      const delta = (frame.seq - this.lastSeq) & 0xffff;
      // The firmware keeps sampling at 50 Hz but may notify every Nth frame
      // (25 Hz stream = every 2nd frame), so a healthy delta equals seqStride.
      if (delta > this.seqStride && delta < 1000) {
        this.seqGaps += delta - this.seqStride;
      }
    }
    this.lastSeq = frame.seq;
    this.posture = frame.posture;
    this.confidence = frame.confidence;
    if (frame.battery !== 255) this.battery = frame.battery;
  }

  applyStatus(status: StatusFrame) {
    this.battery = status.battery;
    this.posture = status.posture;
    this.confidence = status.confidence;
    this.reserved = status.reserved;
  }

  update(now: number, dt: number): THREE.Quaternion {
    const fresh = this.lastDataAt > 0 && now - this.lastDataAt < 500;
    this.stale = this.lastDataAt > 0 && !fresh && !this.demo;
    const canUpdate = fresh || this.testPose;

    if (this.demo && !fresh) {
      this.demoTime += dt;
      const e = new THREE.Euler(
        Math.sin(this.demoTime * 0.9) * 0.32,
        Math.sin(this.demoTime * 0.62) * 0.52,
        Math.sin(this.demoTime * 0.43) * 0.14,
        "XYZ",
      );
      this.q.setFromEuler(e);
    } else {
      if (this.testPose) {
        this.accelSmooth.set(0.35, 0.35, 0.866);
        this.accelSmoothInit = true;
        this.gyro.set(0, 0, 0);
        if (!this.imuInit) {
          this.q.setFromUnitVectors(this.accelSmooth.clone().normalize(), this.up);
          this.qZero.identity();
          this.imuInit = true;
        }
      }

      if (this.imuInit && canUpdate && this.headingLock) {
        if (this.accelSmooth.lengthSq() > 0.01) {
          const measured = this.accelSmooth.clone().normalize();
          const tilt = new THREE.Quaternion().setFromUnitVectors(measured, this.up);
          const head = new THREE.Vector3(0, 1, 0).applyQuaternion(tilt);
          const yawError = Math.atan2(head.x, head.y);
          const yawCorrection = new THREE.Quaternion().setFromAxisAngle(
            this.up,
            -yawError,
          );
          const target = yawCorrection.multiply(tilt);
          this.q.slerp(target, 0.3);
          this.q.normalize();
        }
      } else if (this.imuInit && canUpdate) {
        const gyroDps = this.gyro.clone();
        if (Math.abs(gyroDps.x) < 0.2) gyroDps.x = 0;
        if (Math.abs(gyroDps.y) < 0.2) gyroDps.y = 0;
        if (Math.abs(gyroDps.z) < 0.2) gyroDps.z = 0;
        const omega = gyroDps.multiplyScalar(Math.PI / 180);
        const angle = omega.length() * dt;
        if (angle > 1e-7) {
          const dq = new THREE.Quaternion().setFromAxisAngle(
            omega.normalize(),
            angle,
          );
          this.q.multiply(dq);
        }
        if (this.accelSmooth.lengthSq() > 0.01) {
          const measured = this.accelSmooth.clone().normalize();
          const estimated = this.up.clone().applyQuaternion(this.q.clone().invert());
          const align = new THREE.Quaternion().setFromUnitVectors(
            measured,
            estimated,
          );
          const correction = new THREE.Quaternion();
          correction.slerp(align, 0.06);
          this.q.multiply(correction);
        }
        this.q.normalize();
      } else if (this.imuInit) {
        this.gyro.set(0, 0, 0);
      }
    }

    this.display.copy(this.q).multiply(this.qZero);
    if (this.yawOffset) {
      this.display.premultiply(
        new THREE.Quaternion().setFromAxisAngle(
          this.up,
          (this.yawOffset * Math.PI) / 180,
        ),
      );
    }
    return this.display;
  }

  zero() {
    this.q.normalize();
    this.qZero.copy(this.q).invert();
  }

  setMode(lock: boolean) {
    this.headingLock = lock;
    this.resetFilter();
  }

  setOrientation(value: number) {
    this.orientation = value;
    this.resetFilter();
  }

  setYaw(value: number) {
    this.yawOffset = value;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_YAW, String(value));
      } catch {
        // ignore storage failures
      }
    }
  }

  flipYaw() {
    this.setYaw((this.yawOffset + 180) % 360);
    return this.yawOffset;
  }

  setTestPose(value: boolean) {
    this.testPose = value;
    this.resetFilter();
  }

  setDemo(value: boolean) {
    this.demo = value;
    this.resetFilter();
  }

  setCalibration(rows: THREE.Vector3[]) {
    this.sensorToBoard = rows;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(
          STORAGE_CALIB,
          JSON.stringify(rows.map((v) => [v.x, v.y, v.z])),
        );
        window.localStorage.removeItem(STORAGE_CALIB_OLD);
      } catch {
        // ignore storage failures
      }
    }
    this.resetFilter();
  }

  clearCalibration() {
    this.sensorToBoard = null;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(STORAGE_CALIB);
        window.localStorage.removeItem(STORAGE_CALIB_OLD);
      } catch {
        // ignore storage failures
      }
    }
    this.resetFilter();
  }

  resetFilter() {
    this.imuInit = false;
    this.accelSmoothInit = false;
    this.q.identity();
    this.qZero.identity();
    this.stillMs = 0;
    this.stale = false;
    this.frameCount = 0;
    this.crcErrors = 0;
    this.seqGaps = 0;
    this.lastSeq = null;
    this.lastDataAt = 0;
  }

  setStreamRate(rateHz: number) {
    this.seqStride = Math.max(1, Math.round(50 / rateHz));
  }

  resetSequence() {
    this.lastSeq = null;
  }

  getAngles(): { roll: number; pitch: number } | null {
    const ax = this.accelSmooth.x;
    const ay = this.accelSmooth.y;
    const az = this.accelSmooth.z;
    if (ax === 0 && ay === 0 && az === 0) return null;
    return {
      roll: (Math.atan2(ay, az) * 180) / Math.PI,
      pitch: (Math.atan2(-ax, Math.hypot(ay, az)) * 180) / Math.PI,
    };
  }

  getMetrics(connected: boolean): PoseMetrics {
    return {
      posture: this.posture,
      confidence: this.confidence,
      battery: this.battery,
      reserved: this.reserved,
      frames: this.frameCount,
      crcErrors: this.crcErrors,
      seqGaps: this.seqGaps,
      angles: this.getAngles(),
      stale: this.stale,
      demo: this.demo,
      connected,
    };
  }
}
