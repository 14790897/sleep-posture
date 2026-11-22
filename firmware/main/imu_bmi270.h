#pragma once

#include "imu.h"

esp_err_t imu_bmi270_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr);
esp_err_t imu_bmi270_read(imu_t *imu, sp_motion_t *out);
