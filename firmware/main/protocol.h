#pragma once

#include <stddef.h>
#include <stdint.h>

#define SP_PROTO_VERSION 1
#define SP_FRAME_LEN 24
#define SP_STATUS_LEN 12

/* 128-bit UUIDs, string form (used by host tools / docs). */
#define SP_UUID_SERVICE "b7a10001-4c3d-4e2f-9a8b-1c2d3e4f5a60"
#define SP_UUID_CONTROL "b7a10002-4c3d-4e2f-9a8b-1c2d3e4f5a60"
#define SP_UUID_DATA "b7a10003-4c3d-4e2f-9a8b-1c2d3e4f5a60"
#define SP_UUID_STATUS "b7a10004-4c3d-4e2f-9a8b-1c2d3e4f5a60"

typedef enum {
    SP_POSTURE_UNKNOWN = 0,
    SP_POSTURE_SUPINE = 1, /* 仰卧 */
    SP_POSTURE_PRONE = 2,  /* 俯卧 */
    SP_POSTURE_LEFT = 3,   /* 左侧卧（左侧朝下） */
    SP_POSTURE_RIGHT = 4,  /* 右侧卧（右侧朝下） */
    SP_POSTURE_MOVING = 5, /* 翻身/过渡，不作为最终类别 */
} sp_posture_t;

/* frame.flags bits */
#define SP_FLAG_CALIBRATED 0x01
#define SP_FLAG_POSTURE_VALID 0x02
#define SP_FLAG_MOVING 0x04
#define SP_FLAG_LOW_BATTERY 0x08
#define SP_FLAG_STREAMING 0x10

typedef struct __attribute__((packed)) {
    uint8_t version;
    uint8_t flags;
    uint16_t seq;
    uint32_t t_ms; /* ms since boot/session start */
    int16_t ax_mg;
    int16_t ay_mg;
    int16_t az_mg;
    int16_t gx_ddps; /* 0.1 deg/s */
    int16_t gy_ddps;
    int16_t gz_ddps;
    uint8_t posture;
    uint8_t confidence; /* 0..100 */
    uint8_t battery;    /* 0..100, 255 unknown */
    uint8_t crc8;       /* CRC-8/ATM over bytes [0, 23) */
} sp_frame_t;

_Static_assert(sizeof(sp_frame_t) == SP_FRAME_LEN, "sp_frame_t must be 24 bytes");

typedef struct __attribute__((packed)) {
    uint8_t version;
    uint8_t battery;
    uint8_t posture;
    uint8_t confidence;
    uint8_t flags;
    uint8_t reserved;
    uint16_t session_id;
    uint32_t uptime_s;
} sp_status_t;

_Static_assert(sizeof(sp_status_t) == SP_STATUS_LEN, "sp_status_t must be 12 bytes");

/* Control characteristic opcodes (host -> device). */
typedef enum {
    SP_CMD_START_STREAM = 0x01, /* [rate_hz] optional */
    SP_CMD_STOP_STREAM = 0x02,
    SP_CMD_CALIB_GYRO = 0x03,
    SP_CMD_CALIB_MOUNT_SUPINE = 0x04, /* reserved for v1 */
    SP_CMD_CALIB_MOUNT_RIGHT = 0x05,  /* reserved for v1 */
    SP_CMD_MARK_EVENT = 0x06,         /* [label] */
    SP_CMD_SET_LABEL = 0x07,          /* [label] host-side ground truth */
    SP_CMD_SET_TIME = 0x08,           /* [unix_ms u64] */
    SP_CMD_CLEAR_CALIB = 0x09,
    SP_CMD_SET_RAW_MODE = 0x0a, /* [0=posture+raw, 1=raw only] */
} sp_cmd_t;

uint8_t sp_crc8(const uint8_t *data, size_t len);
void sp_frame_finalize(sp_frame_t *frame);
