#include "imu.h"

#include <string.h>

#include "esp_log.h"

#include "imu_bmi270.h"
#include "imu_bmi220.h"
#include "imu_lsm6ds3.h"

static const char *TAG = "imu";

const char *imu_type_name(imu_type_t type)
{
    switch (type) {
    case IMU_TYPE_LSM6DS3TR_C: return "LSM6DS3TR-C";
    case IMU_TYPE_BMI270: return "BMI270";
    case IMU_TYPE_BMI220: return "BMI220";
    default: return "none";
    }
}

esp_err_t imu_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr)
{
    memset(imu, 0, sizeof(*imu));

    if (addr == 0x6A || addr == 0x6B) {
        return lsm6ds3_init(imu, bus, addr);
    }
    if (addr == 0x68 || addr == 0x69) {
        if (imu_bmi270_init(imu, bus, addr) == ESP_OK) {
            return ESP_OK;
        }
        memset(imu, 0, sizeof(*imu));
        return imu_bmi220_init(imu, bus, addr);
    }
    if (addr != 0) {
        ESP_LOGE(TAG, "unsupported IMU address 0x%02x", addr);
        return ESP_ERR_INVALID_ARG;
    }

    /* Auto-detect: LSM6DS3TR-C first, then BMI270. */
    static const uint8_t lsm_addrs[] = {0x6A, 0x6B};
    for (size_t i = 0; i < sizeof(lsm_addrs); i++) {
        if (lsm6ds3_init(imu, bus, lsm_addrs[i]) == ESP_OK) {
            ESP_LOGI(TAG, "detected %s at 0x%02x", imu_type_name(imu->type), lsm_addrs[i]);
            return ESP_OK;
        }
        memset(imu, 0, sizeof(*imu));
    }

    static const uint8_t bmi_addrs[] = {0x68, 0x69};
    for (size_t i = 0; i < sizeof(bmi_addrs); i++) {
        if (imu_bmi270_init(imu, bus, bmi_addrs[i]) == ESP_OK) {
            ESP_LOGI(TAG, "detected %s at 0x%02x", imu_type_name(imu->type), bmi_addrs[i]);
            return ESP_OK;
        }
        memset(imu, 0, sizeof(*imu));
        if (imu_bmi220_init(imu, bus, bmi_addrs[i]) == ESP_OK) {
            ESP_LOGI(TAG, "detected %s at 0x%02x", imu_type_name(imu->type), bmi_addrs[i]);
            return ESP_OK;
        }
        memset(imu, 0, sizeof(*imu));
    }

    ESP_LOGE(TAG, "no IMU found (LSM6DS3TR-C 0x6A/0x6B, BMI270 0x68/0x69, BMI220 0x68/0x69)");
    return ESP_ERR_NOT_FOUND;
}

esp_err_t imu_read_scaled(imu_t *imu, sp_motion_t *out)
{
    switch (imu->type) {
    case IMU_TYPE_LSM6DS3TR_C: return lsm6ds3_read_scaled(imu, out);
    case IMU_TYPE_BMI270: return imu_bmi270_read(imu, out);
    case IMU_TYPE_BMI220: return imu_bmi220_read(imu, out);
    default: return ESP_ERR_INVALID_STATE;
    }
}
