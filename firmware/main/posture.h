#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "protocol.h"

/*
 * 传感器坐标系约定（佩戴在胸骨，元件面朝外、远离身体，丝印 TOP 朝头部）：
 *   +X = 受试者左侧（元件面朝外时，板级 +X 在观察者看来朝右，即受试者左侧）
 *   +Y = 朝头部
 *   +Z = 垂直胸骨向外（仰卧时朝上）
 * 静止时加速度计读数：轴朝上为 +1g。
 *   仰卧 az≈+1g；俯卧 az≈-1g；
 *   左侧卧（左侧朝下，+X 朝下）ax≈-1g；右侧卧 ax≈+1g。
 * 若元件面朝向身体佩戴，左右会互换；不要反装。
 */
typedef struct {
    float ax, ay, az; /* g */
    float gx, gy, gz; /* deg/s */
} sp_motion_t;

typedef struct {
    sp_posture_t stable;
    sp_posture_t pending;
    uint32_t pending_since_ms;
    uint32_t stable_since_ms;
    uint32_t last_motion_ms;
    bool moving;
    uint8_t confidence;

    /* tunables, initialized by sp_posture_init() */
    float enter_g;
    float switch_g;
    float move_gyro_dps;
    float move_acc_dev_g;
    uint32_t enter_hold_ms;
    uint32_t switch_hold_ms;
    uint32_t unknown_hold_ms;
    uint32_t still_hold_ms;
    uint32_t moving_hold_ms;
} sp_posture_state_t;

void sp_posture_init(sp_posture_state_t *st);
sp_posture_t sp_posture_classify_vector(const sp_motion_t *m);
sp_posture_t sp_posture_classify_with_threshold(const sp_motion_t *m, float threshold);
void sp_posture_update(sp_posture_state_t *st, const sp_motion_t *m, uint32_t now_ms);
const char *sp_posture_name(sp_posture_t p);
