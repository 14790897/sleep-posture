#!/usr/bin/env python3
"""睡眠姿势数据的离线评估与基线模型。

子命令：
  selftest                 用合成数据检查阈值分类器与迟滞逻辑
  eval  <csv>              评估一段带 label_name 的采集数据
  train <csv...>           按夜晚分组做留一晚交叉验证（随机森林 vs 阈值基线）

依赖：numpy, scikit-learn
"""

from __future__ import annotations

import argparse
import csv
import glob
import sys
from pathlib import Path

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import LeaveOneGroupOut

LABEL_NAMES = {1: "supine", 2: "prone", 3: "left", 4: "right"}
NAME_TO_LABEL = {v: k for k, v in LABEL_NAMES.items()}
CLASSES = [1, 2, 3, 4]
FS = 50.0


def classify_arrays(ax, ay, az, threshold=0.60):
    ax = np.asarray(ax, dtype=float)
    ay = np.asarray(ay, dtype=float)
    az = np.asarray(az, dtype=float)
    aax, aay, aaz = np.abs(ax), np.abs(ay), np.abs(az)
    out = np.zeros(ax.shape, dtype=np.int8)
    m = (aaz >= aax) & (aaz >= aay) & (aaz >= threshold)
    out[m & (az > 0)] = 1
    out[m & (az <= 0)] = 2
    m = (aax >= aay) & (aax >= threshold) & ~m
    out[m & (ax > 0)] = 4
    out[m & (ax <= 0)] = 3
    return out


def apply_hysteresis(t_ms, ax, ay, az, gx, gy, gz):
    """与固件 posture.c 相同的状态机（阈值/保持时间一致）。"""
    t = np.asarray(t_ms, dtype=float)
    gyro_mag = np.sqrt(gx * gx + gy * gy + gz * gz)
    acc_mag = np.sqrt(ax * ax + ay * ay + az * az)
    inst = classify_arrays(ax, ay, az)

    stable = np.zeros(len(t), dtype=np.int8)
    cur = 0
    pending = 0
    pending_since = t[0] if len(t) else 0.0
    last_motion = t[0] if len(t) else 0.0
    moving = False

    for i in range(len(t)):
        motion = gyro_mag[i] > 60.0 or abs(acc_mag[i] - 1.0) > 0.25
        if motion:
            last_motion = t[i]
            moving = True
            pending = 0
            pending_since = t[i]
            stable[i] = cur
            continue
        if moving:
            if t[i] - last_motion < 2000.0:
                stable[i] = cur
                continue
            moving = False
            pending = 0
            pending_since = t[i]

        cand = int(inst[i])
        if cur != 0 and cand != cur:
            dom = max(abs(ax[i]), abs(ay[i]), abs(az[i]))
            if dom < 0.70:
                cand = 0
        if cand == cur:
            pending = cand
            pending_since = t[i]
            stable[i] = cur
            continue
        if cand != pending:
            pending = cand
            pending_since = t[i]
        hold = 3000.0 if cur == 0 else 5000.0
        if cand == 0:
            hold = 8000.0
        if t[i] - pending_since >= hold:
            cur = cand
        stable[i] = cur
    return stable


def load_csv(path: str):
    with open(path, newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise ValueError(f"empty csv: {path}")

    def arr(key, default=0):
        out = []
        for r in rows:
            v = r.get(key, "")
            out.append(float(v) if v not in ("", None) else default)
        return np.asarray(out, dtype=float)

    data = {
        "t_ms": arr("t_ms"),
        "ax": arr("ax_mg") / 1000.0,
        "ay": arr("ay_mg") / 1000.0,
        "az": arr("az_mg") / 1000.0,
        "gx": arr("gx_ddps") / 10.0,
        "gy": arr("gy_ddps") / 10.0,
        "gz": arr("gz_ddps") / 10.0,
    }
    if "crc_ok" in rows[0]:
        crc = arr("crc_ok", 1).astype(bool)
        for k in data:
            data[k] = data[k][crc]
        rows = [r for r, ok in zip(rows, crc) if ok]

    labels = []
    label_ids = []
    for r in rows:
        name = (r.get("label_name") or "").strip().lower()
        if not name and r.get("label_id") not in ("", None):
            lid = int(float(r["label_id"]))
            name = LABEL_NAMES.get(lid, "")
        labels.append(NAME_TO_LABEL.get(name, 0))
        label_ids.append(int(float(r.get("label_id") or 0)))
    data["label"] = np.asarray(labels, dtype=np.int8)
    data["label_id"] = np.asarray(label_ids, dtype=np.int16)
    data["posture"] = arr("posture").astype(np.int8)
    data["path"] = path
    return data


def estimate_fs(t_ms):
    if len(t_ms) < 2:
        return FS
    dt = float(np.median(np.diff(t_ms)))
    if dt <= 0:
        return FS
    return float(np.clip(1000.0 / dt, 1.0, 100.0))


def weighted_accuracy(t_ms, y_true, y_pred):
    if len(t_ms) < 2:
        return float(np.mean(y_true == y_pred)) if len(t_ms) else 0.0
    dt = np.diff(t_ms, append=t_ms[-1] + 20.0)
    dt = np.clip(dt, 0.0, 1000.0)
    correct = (y_true == y_pred).astype(float)
    return float((correct * dt).sum() / max(dt.sum(), 1e-9))


def epoch_majority(t_ms, labels, epoch_ms=30000.0):
    """把连续时间按 epoch_ms 分桶，取每桶多数标签（用于 30 s epoch 口径）。"""
    out = []
    if len(t_ms) == 0:
        return np.asarray(out, dtype=np.int8)
    start = t_ms[0]
    buf = []
    for t, lab in zip(t_ms, labels):
        if t - start >= epoch_ms and buf:
            out.append(int(np.bincount(buf).argmax()))
            buf = []
            start = t
        buf.append(int(lab))
    if buf:
        out.append(int(np.bincount(buf).argmax()))
    return np.asarray(out, dtype=np.int8)


def eval_one(path: str, settle_s: float = 10.0):
    d = load_csv(path)
    mask = np.isin(d["label"], CLASSES)
    if not mask.any():
        print(f"{path}: no ground-truth label_name; posture distribution:")
        vals, counts = np.unique(d["posture"], return_counts=True)
        for v, c in zip(vals, counts):
            print(f"  {LABEL_NAMES.get(int(v), 'unknown/moving'):>12}: {c}")
        return None

    y_true = d["label"][mask]
    y_pred = apply_hysteresis(
        d["t_ms"][mask], d["ax"][mask], d["ay"][mask], d["az"][mask],
        d["gx"][mask], d["gy"][mask], d["gz"][mask],
    )
    inst = classify_arrays(d["ax"][mask], d["ay"][mask], d["az"][mask])
    t = d["t_ms"][mask]
    fs = estimate_fs(t)

    # 稳态口径：每个连续标签块的前 settle_s 秒是佩戴/翻身过渡，单独统计
    keep = np.zeros(len(y_true), dtype=bool)
    block_start = 0
    for i in range(1, len(y_true) + 1):
        if i == len(y_true) or y_true[i] != y_true[block_start]:
            if t[i - 1] - t[block_start] >= settle_s * 1000.0:
                keep[block_start + int(settle_s * fs):i] = True
            block_start = i

    print(f"\n== {path} ==")
    print(f"labeled samples: {mask.sum()} / {len(mask)}  ({mask.mean()*100:.1f}%)")
    print(f"threshold accuracy (sample):    {np.mean(inst == y_true)*100:.2f}%")
    print(f"hysteresis accuracy (including transitions): {np.mean(y_pred == y_true)*100:.2f}%")
    if keep.any():
        print(f"steady-state samples: {keep.sum()} ({keep.mean()*100:.1f}%), settle={settle_s:.0f}s")
        print(f"steady-state accuracy (sample):  {np.mean(y_pred[keep] == y_true[keep])*100:.2f}%")
        print(f"steady-state accuracy (time):    {weighted_accuracy(t[keep], y_true[keep], y_pred[keep])*100:.2f}%")

        # 30 s epoch 口径（与睡眠文献对齐）
        ep_true = epoch_majority(t[keep], y_true[keep], 30000.0)
        ep_pred = epoch_majority(t[keep], y_pred[keep], 30000.0)
        if len(ep_true) >= 2:
            present = sorted(set(int(x) for x in ep_true) | set(int(x) for x in ep_pred))
            print(f"30s epoch accuracy:              {np.mean(ep_true == ep_pred)*100:.2f}% "
                  f"(n={len(ep_true)})")
            print(f"30s epoch macro-F1:              "
                  f"{f1_score(ep_true, ep_pred, labels=present, average='macro', zero_division=0):.3f} "
                  f"(classes={present})")
    else:
        print(f"WARNING: no label block longer than settle={settle_s:.0f}s")

    print("\nclassification report (hysteresis, steady-state):")
    if keep.any():
        print(classification_report(y_true[keep], y_pred[keep], labels=CLASSES,
                                    target_names=[LABEL_NAMES[c] for c in CLASSES], zero_division=0))
        print("confusion matrix rows=true cols=pred, classes 1..4:")
        print(confusion_matrix(y_true[keep], y_pred[keep], labels=CLASSES))
        print(f"unknown predictions: {np.mean(y_pred[keep] == 0)*100:.2f}%")
    return d, y_true, y_pred


def window_features(d, win_s=2.0, step_s=1.0):
    fs = estimate_fs(d["t_ms"])
    n = int(win_s * fs)
    step = int(step_s * fs)
    feats, labels, groups = [], [], []
    for start in range(0, len(d["t_ms"]) - n, step):
        end = start + n
        y = d["label"][start:end]
        if not np.isin(y, CLASSES).all():
            continue
        if len(set(y.tolist())) != 1:
            continue
        row = []
        for key in ("ax", "ay", "az", "gx", "gy", "gz"):
            seg = d[key][start:end]
            row.extend([seg.mean(), seg.std(), seg.min(), seg.max()])
        feats.append(row)
        labels.append(int(y[0]))
        groups.append(Path(d["path"]).stem.split("_")[0])
    return np.asarray(feats), np.asarray(labels), np.asarray(groups)


def train(paths):
    datasets = [load_csv(p) for p in paths]
    X, y, g = [], [], []
    for d in datasets:
        if not np.isin(d["label"], CLASSES).any():
            print(f"skip {d['path']}: no labels")
            continue
        fx, fy, fg = window_features(d)
        X.append(fx)
        y.append(fy)
        g.append(fg)
    if not X:
        print("no labeled windows found", file=sys.stderr)
        return 1
    X = np.vstack(X)
    y = np.concatenate(y)
    g = np.concatenate(g)
    if len(y) == 0:
        print("no labeled windows found", file=sys.stderr)
        return 1
    print(f"windows={len(y)} features={X.shape[1]} groups(nights)={sorted({str(x) for x in g})}")

    if len(set(g)) < 2:
        print("need at least 2 nights/groups for leave-one-group-out; fitting in-sample only", file=sys.stderr)
        pred = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=0, n_jobs=-1).fit(X, y).predict(X)
    else:
        logo = LeaveOneGroupOut()
        pred = np.zeros_like(y)
        for train_idx, test_idx in logo.split(X, y, g):
            clf = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=0, n_jobs=-1)
            clf.fit(X[train_idx], y[train_idx])
            pred[test_idx] = clf.predict(X[test_idx])

    print("\nrandom forest, leave-one-night-out:")
    print(classification_report(y, pred, labels=CLASSES, target_names=[LABEL_NAMES[c] for c in CLASSES], zero_division=0))
    print(confusion_matrix(y, pred, labels=CLASSES))
    print(f"macro-F1: {f1_score(y, pred, labels=CLASSES, average='macro', zero_division=0):.3f}")
    return 0


def selftest():
    rng = np.random.default_rng(0)
    fs = 50
    seg_s = 20
    postures = [1, 2, 3, 4]
    vectors = {1: (0, 0, 1), 2: (0, 0, -1), 3: (-1, 0, 0), 4: (1, 0, 0)}
    t_all, ax_all, ay_all, az_all, label_all = [], [], [], [], []
    segments = []
    t0 = 0.0
    for rep in range(3):
        for p in postures:
            n = seg_s * fs
            v = np.array(vectors[p], dtype=float)
            # 小幅安装倾斜 + 噪声
            tilt = rng.normal(0, 0.08, 3)
            v = v + tilt
            v /= np.linalg.norm(v)
            noise = rng.normal(0, 0.02, (n, 3))
            a = v[None, :] + noise
            t = t0 + np.arange(n) / fs * 1000.0
            start = sum(len(x) for x in t_all)
            segments.append((start, start + n, p))
            t_all.append(t)
            ax_all.append(a[:, 0]); ay_all.append(a[:, 1]); az_all.append(a[:, 2])
            label_all.append(np.full(n, p, dtype=np.int8))
            t0 = t[-1] + 20
    t = np.concatenate(t_all); ax = np.concatenate(ax_all); ay = np.concatenate(ay_all)
    az = np.concatenate(az_all); y = np.concatenate(label_all)
    g = np.zeros_like(y, dtype=float)
    inst = classify_arrays(ax, ay, az)
    inst_acc = np.mean(inst == y)
    pred = apply_hysteresis(t, ax, ay, az, g, g, g)
    settled = 0
    for start, end, label in segments:
        tail = pred[max(start, end - 5 * fs):end]
        if np.bincount(tail.astype(int)).argmax() == label:
            settled += 1
    print(f"synthetic per-sample accuracy: {inst_acc*100:.2f}%  (n={len(y)})")
    print(f"hysteresis settled correctly: {settled}/{len(segments)} segments (last 5s)")
    if inst_acc < 0.99 or settled != len(segments):
        print("FAIL: classifier/hysteresis did not separate synthetic postures", file=sys.stderr)
        return 1
    print("OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("selftest")
    p_eval = sub.add_parser("eval")
    p_eval.add_argument("csv")
    p_eval.add_argument("--settle", type=float, default=10.0, help="skip first N seconds of each label block")
    p_train = sub.add_parser("train")
    p_train.add_argument("csv", nargs="+")
    args = ap.parse_args()

    if args.cmd == "selftest":
        return selftest()
    if args.cmd == "eval":
        eval_one(args.csv, args.settle)
        return 0
    if args.cmd == "train":
        paths = []
        for pattern in args.csv:
            paths.extend(glob.glob(pattern))
        if not paths:
            print("no csv matched", file=sys.stderr)
            return 1
        return train(sorted(set(paths)))
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
