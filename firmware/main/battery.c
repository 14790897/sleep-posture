#include "battery.h"

#include <stdbool.h>
#include <stddef.h>

#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"

static const char *TAG = "battery";

#define BAT_ADC_UNIT ADC_UNIT_1
#define BAT_ADC_CHANNEL ADC_CHANNEL_1 /* GPIO1 on ESP32-C3 */
#define BAT_DIVIDER 2.0f             /* 1:1 divider, mV at ADC * 2 = battery mV */

static adc_oneshot_unit_handle_t s_unit;
static adc_cali_handle_t s_cali;
static bool s_ready;

esp_err_t battery_init(void)
{
    adc_oneshot_unit_init_cfg_t init_cfg = {
        .unit_id = BAT_ADC_UNIT,
    };
    esp_err_t err = adc_oneshot_new_unit(&init_cfg, &s_unit);
    if (err != ESP_OK) return err;

    adc_oneshot_chan_cfg_t chan_cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    err = adc_oneshot_config_channel(s_unit, BAT_ADC_CHANNEL, &chan_cfg);
    if (err != ESP_OK) return err;

    adc_cali_curve_fitting_config_t cali_cfg = {
        .unit_id = BAT_ADC_UNIT,
        .chan = BAT_ADC_CHANNEL,
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_DEFAULT,
    };
    err = adc_cali_create_scheme_curve_fitting(&cali_cfg, &s_cali);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ADC calibration unavailable: %s", esp_err_to_name(err));
        s_cali = NULL;
    }
    s_ready = true;
    return ESP_OK;
}

esp_err_t battery_read_mv(int *mv)
{
    if (!s_ready) return ESP_ERR_INVALID_STATE;
    int raw = 0;
    esp_err_t err = adc_oneshot_read(s_unit, BAT_ADC_CHANNEL, &raw);
    if (err != ESP_OK) return err;

    int adc_mv;
    if (s_cali) {
        err = adc_cali_raw_to_voltage(s_cali, raw, &adc_mv);
        if (err != ESP_OK) return err;
    } else {
        adc_mv = raw * 3300 / 4095;
    }
    *mv = (int)(adc_mv * BAT_DIVIDER);
    return ESP_OK;
}

uint8_t battery_read_percent(void)
{
    int mv;
    if (battery_read_mv(&mv) != ESP_OK) return 255;
    /* 粗略映射：3.40V=0%, 4.15V=100%。仅用于显示，不用于低电保护。 */
    if (mv >= 4150) return 100;
    if (mv <= 3400) return 0;
    return (uint8_t)((mv - 3400) * 100 / (4150 - 3400));
}
