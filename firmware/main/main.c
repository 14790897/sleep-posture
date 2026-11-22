#include <math.h>
#include <string.h>

#include "driver/i2c_master.h"
#include "esp_err.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs_flash.h"

#include "battery.h"
#include "ble_service.h"
#include "calibration.h"
#include "imu.h"
#include "posture.h"
#include "protocol.h"

static const char *TAG = "sleep-posture";

#define PIN_I2C_SDA 4
#define PIN_I2C_SCL 5
#define PIN_IMU_INT 6
#define PIN_LED 7
#define PIN_BUTTON 9
#define PIN_VBAT_ADC 1

#define SAMPLE_PERIOD_MS 20 /* 50 Hz */
#define BATTERY_PERIOD_MS 10000

typedef struct {
    imu_t imu;
    sp_calib_t calib;
    sp_posture_state_t posture;
    uint16_t seq;
    uint16_t session_id;
    uint8_t battery;
    uint32_t last_battery_ms;
} app_ctx_t;

static app_ctx_t s_ctx;

static int16_t clamp_i16(float v)
{
    if (v > 32767.0f) return 32767;
    if (v < -32768.0f) return -32768;
    return (int16_t)lrintf(v);
}

static uint8_t current_flags(const app_ctx_t *ctx)
{
    uint8_t flags = 0;
    if (ctx->calib.valid) flags |= SP_FLAG_CALIBRATED;
    if (ctx->posture.stable != SP_POSTURE_UNKNOWN) flags |= SP_FLAG_POSTURE_VALID;
    if (ctx->posture.moving) flags |= SP_FLAG_MOVING;
    if (ctx->battery != 255 && ctx->battery < 15) flags |= SP_FLAG_LOW_BATTERY;
    if (sp_ble_stream_enabled()) flags |= SP_FLAG_STREAMING;
    return flags;
}

static void sample_task(void *arg)
{
    app_ctx_t *ctx = arg;
    TickType_t last = xTaskGetTickCount();
    uint32_t notify_counter = 0;

    while (1) {
        vTaskDelayUntil(&last, pdMS_TO_TICKS(SAMPLE_PERIOD_MS));

        if (ctx->imu.type == IMU_TYPE_NONE) {
            continue;
        }

        if (sp_ble_take_calib_request()) {
            sp_calib_run_gyro(&ctx->imu, &ctx->calib, 200);
            sp_calib_save(&ctx->calib);
        }
        if (sp_ble_take_clear_calib_request()) {
            memset(&ctx->calib, 0, sizeof(ctx->calib));
            sp_calib_save(&ctx->calib);
        }

        sp_motion_t m;
        if (imu_read_scaled(&ctx->imu, &m) != ESP_OK) {
            ESP_LOGW(TAG, "imu read failed");
            continue;
        }
        sp_calib_apply(&ctx->calib, &m);

        static uint32_t log_div = 0;
        if ((++log_div % 50) == 0) {
            ESP_LOGI(TAG, "a=(%.2f %.2f %.2f) g g=(%.1f %.1f %.1f) dps",
                     m.ax, m.ay, m.az, m.gx, m.gy, m.gz);
        }

        uint32_t now_ms = (uint32_t)(esp_timer_get_time() / 1000);
        sp_posture_update(&ctx->posture, &m, now_ms);

        if (ctx->last_battery_ms == 0 || (now_ms - ctx->last_battery_ms) > BATTERY_PERIOD_MS) {
            ctx->battery = battery_read_percent();
            ctx->last_battery_ms = now_ms;
        }

        sp_frame_t frame = {0};
        frame.flags = current_flags(ctx);
        frame.seq = ++ctx->seq;
        frame.t_ms = now_ms;
        frame.ax_mg = clamp_i16(m.ax * 1000.0f);
        frame.ay_mg = clamp_i16(m.ay * 1000.0f);
        frame.az_mg = clamp_i16(m.az * 1000.0f);
        frame.gx_ddps = clamp_i16(m.gx * 10.0f);
        frame.gy_ddps = clamp_i16(m.gy * 10.0f);
        frame.gz_ddps = clamp_i16(m.gz * 10.0f);
        frame.posture = ctx->posture.moving ? SP_POSTURE_MOVING : (uint8_t)ctx->posture.stable;
        frame.confidence = ctx->posture.moving ? 0 : ctx->posture.confidence;
        frame.battery = ctx->battery;
        sp_frame_finalize(&frame);

        if (sp_ble_stream_enabled() && (notify_counter++ % sp_ble_notify_div()) == 0) {
            sp_ble_notify_data(&frame);
        }
    }
}

static void status_task(void *arg)
{
    app_ctx_t *ctx = arg;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));

        sp_status_t st = {
            .version = SP_PROTO_VERSION,
            .battery = ctx->battery,
            .posture = ctx->posture.moving ? SP_POSTURE_MOVING : (uint8_t)ctx->posture.stable,
            .confidence = ctx->posture.moving ? 0 : ctx->posture.confidence,
            .flags = current_flags(ctx),
            .reserved = 0,
            .session_id = ctx->session_id,
            .uptime_s = (uint32_t)(esp_timer_get_time() / 1000000),
        };
        sp_ble_notify_status(&st);
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "sleep posture firmware v%d", SP_PROTO_VERSION);

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    memset(&s_ctx, 0, sizeof(s_ctx));
    s_ctx.session_id = (uint16_t)(esp_random() & 0xffff);
    sp_posture_init(&s_ctx.posture);

    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = PIN_I2C_SDA,
        .scl_io_num = PIN_I2C_SCL,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };
    i2c_master_bus_handle_t bus;
    ESP_ERROR_CHECK(i2c_new_master_bus(&bus_cfg, &bus));

    ESP_LOGI(TAG, "I2C scan: SDA=GPIO%d SCL=GPIO%d", PIN_I2C_SDA, PIN_I2C_SCL);
    for (uint8_t a = 0x08; a < 0x78; ++a) {
        if (i2c_master_probe(bus, a, 50) == ESP_OK) {
            ESP_LOGI(TAG, "I2C ACK 0x%02x", a);
        }
    }
    for (uint8_t a = 0x68; a <= 0x69; ++a) {
        i2c_device_config_t dev_cfg = {
            .dev_addr_length = I2C_ADDR_BIT_LEN_7,
            .device_address = a,
            .scl_speed_hz = 100000,
        };
        i2c_master_dev_handle_t dev = NULL;
        if (i2c_master_bus_add_device(bus, &dev_cfg, &dev) == ESP_OK) {
            uint8_t reg = 0x00, id = 0;
            esp_err_t e = i2c_master_transmit_receive(dev, &reg, 1, &id, 1, 100);
            ESP_LOGI(TAG, "WHO_AM_I 0x%02x = 0x%02x (%s)", a, id, esp_err_to_name(e));
            i2c_master_bus_rm_device(dev);
        }
    }

    esp_err_t imu_err = imu_init(&s_ctx.imu, bus, 0);
    if (imu_err != ESP_OK) {
        ESP_LOGE(TAG, "IMU init failed: %s; sampling disabled", esp_err_to_name(imu_err));
    } else {
        ESP_LOGI(TAG, "IMU: %s", imu_type_name(s_ctx.imu.type));
        sp_motion_t m0;
        if (imu_read_scaled(&s_ctx.imu, &m0) == ESP_OK) {
            ESP_LOGI(TAG, "first sample a=(%.2f %.2f %.2f) g g=(%.1f %.1f %.1f) dps",
                     m0.ax, m0.ay, m0.az, m0.gx, m0.gy, m0.gz);
        }
    }

    if (sp_calib_load(&s_ctx.calib) != ESP_OK || !s_ctx.calib.valid) {
        memset(&s_ctx.calib, 0, sizeof(s_ctx.calib));
        ESP_LOGW(TAG, "no valid calibration; host can send 0x03 while device is still");
    }

    ESP_ERROR_CHECK(battery_init());
    s_ctx.battery = battery_read_percent();

    ESP_ERROR_CHECK(sp_ble_init());

    xTaskCreate(sample_task, "sample", 6144, &s_ctx, 6, NULL);
    xTaskCreate(status_task, "status", 4096, &s_ctx, 4, NULL);
}
