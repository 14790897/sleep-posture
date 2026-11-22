#include "imu_bmi270.h"

#include "bmi270.h"
#include "esp_log.h"

static const char *TAG = "imu_bmi270";

esp_err_t imu_bmi270_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr)
{
    bmi270_driver_config_t cfg = {
        .addr = addr,
        .interface = BMI270_USE_I2C,
        .i2c_bus = bus,
    };

    bmi270_handle_t *handle = NULL;
    esp_err_t err = bmi270_create(&cfg, &handle);
    if (err != ESP_OK) {
        return err;
    }

    const bmi270_config_t meas = {
        .acce_odr = BMI270_ACC_ODR_50_HZ,
        .acce_range = BMI270_ACC_RANGE_2_G,
        .gyro_odr = BMI270_GYR_ODR_50_HZ,
        .gyro_range = BMI270_GYR_RANGE_250_DPS,
    };
    err = bmi270_start(handle, &meas);
    if (err != ESP_OK) {
        bmi270_delete(handle);
        return err;
    }

    imu->type = IMU_TYPE_BMI270;
    imu->u.bmi270 = handle;
    ESP_LOGI(TAG, "BMI270 ready at 0x%02x, 50 Hz, +/-2 g, +/-250 dps", addr);
    return ESP_OK;
}

esp_err_t imu_bmi270_read(imu_t *imu, sp_motion_t *out)
{
    bmi270_handle_t *handle = (bmi270_handle_t *)imu->u.bmi270;
    if (handle == NULL) return ESP_ERR_INVALID_STATE;

    esp_err_t err = bmi270_get_acce_data(handle, &out->ax, &out->ay, &out->az);
    if (err != ESP_OK) return err;
    return bmi270_get_gyro_data(handle, &out->gx, &out->gy, &out->gz);
}
