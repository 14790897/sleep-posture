#pragma once

#include <stdint.h>

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "posture.h"

typedef enum {
    IMU_TYPE_NONE = 0,
    IMU_TYPE_LSM6DS3TR_C,
    IMU_TYPE_BMI270,
    IMU_TYPE_BMI220,
} imu_type_t;

typedef struct {
    imu_type_t type;
    union {
        struct {
            i2c_master_dev_handle_t dev;
            uint8_t addr;
            uint8_t whoami;
        } lsm6ds3;
        void *bmi270; /* bmi270_handle_t*, owned by imu_bmi270.c */
        void *bmi220; /* bmi220_handle_t*, owned by imu_bmi220.c */
    } u;
} imu_t;

/* addr = 0: auto-detect (LSM6DS3TR-C 0x6A/0x6B, then BMI270 0x68/0x69). */
esp_err_t imu_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr);
esp_err_t imu_read_scaled(imu_t *imu, sp_motion_t *out);
const char *imu_type_name(imu_type_t type);
