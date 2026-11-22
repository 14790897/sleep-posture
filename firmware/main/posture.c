#include "posture.h"

#include <math.h>
#include <string.h>

static float max3(float a, float b, float c)
{
    float m = a > b ? a : b;
    return m > c ? m : c;
}

static float min3(float a, float b, float c)
{
    float m = a < b ? a : b;
    return m < c ? m : c;
}

void sp_posture_init(sp_posture_state_t *st)
{
    memset(st, 0, sizeof(*st));
    st->stable = SP_POSTURE_UNKNOWN;
    st->pending = SP_POSTURE_UNKNOWN;
    st->enter_g = 0.60f;
    st->switch_g = 0.70f;
    st->move_gyro_dps = 60.0f;
    st->move_acc_dev_g = 0.25f;
    st->enter_hold_ms = 3000;
    st->switch_hold_ms = 5000;
    st->unknown_hold_ms = 8000;
    st->still_hold_ms = 2000;
    st->moving_hold_ms = 200;
}

sp_posture_t sp_posture_classify_vector(const sp_motion_t *m)
{
    return sp_posture_classify_with_threshold(m, 0.60f);
}

sp_posture_t sp_posture_classify_with_threshold(const sp_motion_t *m, float threshold)
{
    float ax = fabsf(m->ax);
    float ay = fabsf(m->ay);
    float az = fabsf(m->az);

    if (az >= ax && az >= ay) {
        if (az < threshold) return SP_POSTURE_UNKNOWN;
        return m->az > 0.0f ? SP_POSTURE_SUPINE : SP_POSTURE_PRONE;
    }
    if (ax >= ay) {
        if (ax < threshold) return SP_POSTURE_UNKNOWN;
        /* 元件面朝外时 +X 指向受试者左侧：+X 朝上 => 右侧朝下 */
        return m->ax > 0.0f ? SP_POSTURE_RIGHT : SP_POSTURE_LEFT;
    }
    /* 重力主要落在头脚方向：坐起/半躺等，不归入四类 */
    return SP_POSTURE_UNKNOWN;
}

static uint8_t compute_confidence(const sp_motion_t *m, sp_posture_t p)
{
    float ax = fabsf(m->ax), ay = fabsf(m->ay), az = fabsf(m->az);
    float dom = max3(ax, ay, az);
    float sec = ax + ay + az - dom - min3(ax, ay, az);
    float margin = dom - sec;
    if (p == SP_POSTURE_UNKNOWN || margin < 0.05f) return 0;
    float c = 55.0f + margin * 60.0f;
    if (c > 99.0f) c = 99.0f;
    return (uint8_t)c;
}

void sp_posture_update(sp_posture_state_t *st, const sp_motion_t *m, uint32_t now_ms)
{
    float gyro_mag = sqrtf(m->gx * m->gx + m->gy * m->gy + m->gz * m->gz);
    float acc_mag = sqrtf(m->ax * m->ax + m->ay * m->ay + m->az * m->az);
    bool motion = (gyro_mag > st->move_gyro_dps) || (fabsf(acc_mag - 1.0f) > st->move_acc_dev_g);

    if (motion) {
        st->last_motion_ms = now_ms;
        st->moving = true;
        st->pending = SP_POSTURE_UNKNOWN;
        st->pending_since_ms = now_ms;
        st->confidence = 0;
        return;
    }

    if (st->moving) {
        if ((now_ms - st->last_motion_ms) < st->still_hold_ms) return;
        st->moving = false;
        st->pending = SP_POSTURE_UNKNOWN;
        st->pending_since_ms = now_ms;
    }

    sp_posture_t cand = sp_posture_classify_with_threshold(m, st->enter_g);

    if (st->stable != SP_POSTURE_UNKNOWN && cand != st->stable) {
        float dom = max3(fabsf(m->ax), fabsf(m->ay), fabsf(m->az));
        if (dom < st->switch_g) cand = SP_POSTURE_UNKNOWN;
    }

    if (cand == st->stable) {
        st->pending = cand;
        st->pending_since_ms = now_ms;
        st->confidence = compute_confidence(m, cand);
        return;
    }

    if (cand != st->pending) {
        st->pending = cand;
        st->pending_since_ms = now_ms;
    }

    uint32_t hold = (st->stable == SP_POSTURE_UNKNOWN) ? st->enter_hold_ms : st->switch_hold_ms;
    if (cand == SP_POSTURE_UNKNOWN) hold = st->unknown_hold_ms;

    if ((now_ms - st->pending_since_ms) >= hold) {
        st->stable = cand;
        st->stable_since_ms = now_ms;
        st->confidence = compute_confidence(m, cand);
    }
}

const char *sp_posture_name(sp_posture_t p)
{
    switch (p) {
    case SP_POSTURE_SUPINE: return "supine";
    case SP_POSTURE_PRONE: return "prone";
    case SP_POSTURE_LEFT: return "left";
    case SP_POSTURE_RIGHT: return "right";
    case SP_POSTURE_MOVING: return "moving";
    default: return "unknown";
    }
}
