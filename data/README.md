# 数据目录

```
data/
  raw/          # 原始采集 CSV，只读
  labels/       # 视频/人工标注导出的时间段
  processed/    # 清洗、特征、模型输出
  sessions.csv  # 每次采集的元数据
```

## 命名

```
data/raw/night01_20261103.csv
data/raw/night02_20261105.csv
```

前缀 `nightXX` 用于按夜晚分组交叉验证；不要在中间改前缀。

## `sessions.csv`

字段：

```
session_id,file,date,subject_code,night,sensor_position,strap_height_cm,
pajamas,blanket,pillow,mattress,start_time,end_time,notes
```

示例：

```
N01,night01_20261103.csv,2026-11-03,S01,1,sternum,胸骨下 2cm,薄棉睡衣,薄被,低枕,中等床垫,23:10,07:20,首次整夜
```

## 隐私

- 用 `S01` 这类代号，不写真实姓名。
- 不记录住址、电话、身份证号、工作单位。
- 视频只用于本地标注，不公开原始片段。
- 分享结果时只给统计量和去标识化的片段。

## 质量检查

采集后先跑：

```bash
python tools/posture_ref.py eval data/raw/night01_20261103.csv
```

确认无标签时至少看姿态分布；有标签时看稳态准确率和丢包率。原始文件不要手改。
