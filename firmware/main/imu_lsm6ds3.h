#pragma once

#include "imu.h"

esp_err_t lsm6ds3_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr);
esp_err_t lsm6ds3_read_scaled(imu_t *imu, sp_motion_t *out);
