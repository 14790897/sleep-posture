#pragma once

#include <stdbool.h>

#include "esp_err.h"

#include "imu.h"

typedef struct {
    float gx_bias_dps;
    float gy_bias_dps;
    float gz_bias_dps;
    bool valid;
} sp_calib_t;

esp_err_t sp_calib_load(sp_calib_t *cal);
esp_err_t sp_calib_save(const sp_calib_t *cal);
esp_err_t sp_calib_run_gyro(imu_t *imu, sp_calib_t *cal, int samples);
void sp_calib_apply(const sp_calib_t *cal, sp_motion_t *m);
