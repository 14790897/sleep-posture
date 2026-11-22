#include "calibration.h"

#include <stdbool.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"

static const char *TAG = "calib";
static const char *NVS_NS = "sp_calib";

esp_err_t sp_calib_load(sp_calib_t *cal)
{
    memset(cal, 0, sizeof(*cal));
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READONLY, &h);
    if (err != ESP_OK) return err;

    size_t len = sizeof(*cal);
    err = nvs_get_blob(h, "gyro", cal, &len);
    nvs_close(h);
    if (err == ESP_OK && len == sizeof(*cal) && cal->valid) {
        return ESP_OK;
    }
    memset(cal, 0, sizeof(*cal));
    return err == ESP_OK ? ESP_ERR_NOT_FOUND : err;
}

esp_err_t sp_calib_save(const sp_calib_t *cal)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(NVS_NS, NVS_READWRITE, &h);
    if (err != ESP_OK) return err;
    err = nvs_set_blob(h, "gyro", cal, sizeof(*cal));
    if (err == ESP_OK) err = nvs_commit(h);
    nvs_close(h);
    return err;
}

esp_err_t sp_calib_run_gyro(imu_t *imu, sp_calib_t *cal, int samples)
{
    if (samples < 20) samples = 20;

    double sx = 0, sy = 0, sz = 0;
    int ok = 0;
    for (int i = 0; i < samples; i++) {
        sp_motion_t m;
        if (imu_read_scaled(imu, &m) == ESP_OK) {
            sx += m.gx;
            sy += m.gy;
            sz += m.gz;
            ok++;
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
    if (ok < samples / 2) return ESP_FAIL;

    cal->gx_bias_dps = (float)(sx / ok);
    cal->gy_bias_dps = (float)(sy / ok);
    cal->gz_bias_dps = (float)(sz / ok);
    cal->valid = true;
    ESP_LOGI(TAG, "gyro bias: %.2f %.2f %.2f dps (n=%d)", cal->gx_bias_dps, cal->gy_bias_dps,
             cal->gz_bias_dps, ok);
    return ESP_OK;
}

void sp_calib_apply(const sp_calib_t *cal, sp_motion_t *m)
{
    if (!cal->valid) return;
    m->gx -= cal->gx_bias_dps;
    m->gy -= cal->gy_bias_dps;
    m->gz -= cal->gz_bias_dps;
}
