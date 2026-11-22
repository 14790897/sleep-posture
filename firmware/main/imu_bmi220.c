/*
 * BMI220 driver for the sleep-posture carrier.
 *
 * The BMI220 is a BMI2xy-family part (same LGA-14 footprint as the BMI270)
 * whose chip ID is 0x26, not the BMI270's 0x24.  Its 8 KB RAM image is
 * different, so the BMI270 config blob cannot initialize it.  The blob in
 * bmi220fw.h comes from Bosch's BMI270 Sensor API (bmi220.c), BSD-3-Clause;
 * the full license text is in that header.
 */

#include "imu_bmi220.h"

#include <stdlib.h>
#include <string.h>

#include "bmi220fw.h"
#include "esp_check.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "BMI220";

#define BMI220_CHIP_ID              0x26
#define BMI220_I2C_SPEED_HZ         400000
#define BMI220_TIMEOUT_MS           100

#define BMI220_REG_CHIP_ID          0x00
#define BMI220_REG_DATA             0x0C
#define BMI220_REG_INTERNAL_STATUS  0x21
#define BMI220_REG_GYR_CAS          0x3C
#define BMI220_REG_ACC_CONF         0x40
#define BMI220_REG_ACC_RANGE        0x41
#define BMI220_REG_GYR_CONF         0x42
#define BMI220_REG_GYR_RANGE        0x43
#define BMI220_REG_INIT_CTRL        0x59
#define BMI220_REG_INIT_ADDR        0x5B
#define BMI220_REG_INIT_DATA        0x5E
#define BMI220_REG_PWR_CONF         0x7C
#define BMI220_REG_PWR_CTRL         0x7D
#define BMI220_REG_CMD              0x7E

#define BMI220_CMD_SW_RESET         0xB6
#define BMI220_INTERNAL_INIT_OK     0x01
#define BMI220_PWR_CONF_OFF         0x00
#define BMI220_PWR_CONF_FIFO_WAKEUP 0x02
#define BMI220_PWR_CTRL_ON          0x0E
/* performance mode + normal BWP + 50 Hz (bits 3:0 are the ODR) */
#define BMI220_ACC_CONF_50HZ        0xA7
#define BMI220_ACC_RANGE_2G         0x00
#define BMI220_GYR_CONF_50HZ        0xE7
#define BMI220_GYR_RANGE_250DPS     0x03
#define BMI220_FW_CHUNK_SIZE        32

typedef struct {
    i2c_master_dev_handle_t dev;
    uint8_t addr;
    int8_t zx_factor;
} bmi220_handle_t;

static void wait_ms(uint32_t ms)
{
    vTaskDelay(pdMS_TO_TICKS(ms) + 1);
}

static esp_err_t read_regs(const bmi220_handle_t *h, uint8_t reg, uint8_t *data, size_t len)
{
    return i2c_master_transmit_receive(h->dev, &reg, 1, data, len, BMI220_TIMEOUT_MS);
}

static esp_err_t write_reg(const bmi220_handle_t *h, uint8_t reg, uint8_t value)
{
    uint8_t tx[2] = {reg, value};
    return i2c_master_transmit(h->dev, tx, sizeof(tx), BMI220_TIMEOUT_MS);
}

static esp_err_t write_reg16(const bmi220_handle_t *h, uint8_t reg, uint16_t value)
{
    uint8_t tx[3] = {reg, (uint8_t)(value & 0xFF), (uint8_t)(value >> 8)};
    return i2c_master_transmit(h->dev, tx, sizeof(tx), BMI220_TIMEOUT_MS);
}

static esp_err_t write_bytes(const bmi220_handle_t *h, uint8_t reg, const uint8_t *data, size_t len)
{
    uint8_t tx[1 + BMI220_FW_CHUNK_SIZE];

    if (len > BMI220_FW_CHUNK_SIZE) {
        return ESP_ERR_INVALID_ARG;
    }
    tx[0] = reg;
    memcpy(&tx[1], data, len);
    return i2c_master_transmit(h->dev, tx, len + 1, BMI220_TIMEOUT_MS);
}

static esp_err_t upload_firmware(const bmi220_handle_t *h)
{
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_CMD, BMI220_CMD_SW_RESET), TAG, "soft reset");
    wait_ms(12);
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_PWR_CONF, BMI220_PWR_CONF_OFF), TAG,
                        "disable power save");
    wait_ms(1);
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_INIT_CTRL, 0x00), TAG, "start firmware init");

    for (size_t pos = 0; pos < sizeof(bmi220_firmware);) {
        size_t chunk = sizeof(bmi220_firmware) - pos;
        if (chunk > BMI220_FW_CHUNK_SIZE) {
            chunk = BMI220_FW_CHUNK_SIZE;
        }
        uint16_t words = (uint16_t)(pos >> 1);
        uint16_t init_pos = (uint16_t)((words & 0x000F) | ((words << 4) & 0xFF00));
        ESP_RETURN_ON_ERROR(write_reg16(h, BMI220_REG_INIT_ADDR, init_pos), TAG,
                            "set firmware address");
        ESP_RETURN_ON_ERROR(write_bytes(h, BMI220_REG_INIT_DATA, &bmi220_firmware[pos], chunk), TAG,
                            "write firmware");
        pos += chunk;
    }

    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_INIT_CTRL, 0x01), TAG, "end firmware init");
    wait_ms(140);
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_PWR_CONF, BMI220_PWR_CONF_FIFO_WAKEUP), TAG,
                        "enable fifo wakeup");

    uint8_t status = 0;
    esp_err_t err = ESP_ERR_TIMEOUT;
    for (int i = 0; i < 20; ++i) {
        err = read_regs(h, BMI220_REG_INTERNAL_STATUS, &status, 1);
        if (err == ESP_OK && (status & BMI220_INTERNAL_INIT_OK)) {
            return ESP_OK;
        }
        wait_ms(10);
    }
    ESP_LOGE(TAG, "internal status 0x%02x, firmware init failed", status);
    return (err == ESP_OK) ? ESP_ERR_INVALID_STATE : err;
}

static esp_err_t apply_config(bmi220_handle_t *h)
{
    uint8_t cas = 0;
    if (read_regs(h, BMI220_REG_GYR_CAS, &cas, 1) == ESP_OK) {
        uint8_t sign = (uint8_t)((cas << 1) & 0x80);
        h->zx_factor = (int8_t)(cas | sign);
    }

    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_GYR_CONF, BMI220_GYR_CONF_50HZ), TAG,
                        "set gyro ODR");
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_GYR_RANGE, BMI220_GYR_RANGE_250DPS), TAG,
                        "set gyro range");
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_ACC_CONF, BMI220_ACC_CONF_50HZ), TAG,
                        "set acc ODR");
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_ACC_RANGE, BMI220_ACC_RANGE_2G), TAG,
                        "set acc range");
    ESP_RETURN_ON_ERROR(write_reg(h, BMI220_REG_PWR_CTRL, BMI220_PWR_CTRL_ON), TAG,
                        "enable acc/gyro/temp");
    wait_ms(100);
    return ESP_OK;
}

esp_err_t imu_bmi220_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr)
{
    bmi220_handle_t *h = calloc(1, sizeof(*h));
    if (h == NULL) {
        return ESP_ERR_NO_MEM;
    }
    h->addr = addr;

    const i2c_device_config_t cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr,
        .scl_speed_hz = BMI220_I2C_SPEED_HZ,
    };
    esp_err_t err = i2c_master_bus_add_device(bus, &cfg, &h->dev);
    if (err != ESP_OK) {
        free(h);
        return err;
    }

    uint8_t id = 0;
    for (int i = 0; i < 3; ++i) {
        err = read_regs(h, BMI220_REG_CHIP_ID, &id, 1);
        if (err == ESP_OK && id == BMI220_CHIP_ID) {
            break;
        }
        wait_ms(2);
    }
    if (err != ESP_OK || id != BMI220_CHIP_ID) {
        ESP_LOGE(TAG, "chip ID 0x%02x (expect 0x26): %s", id, esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return ESP_ERR_NOT_FOUND;
    }

    err = upload_firmware(h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "firmware upload failed: %s", esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return err;
    }

    err = apply_config(h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "configuration failed: %s", esp_err_to_name(err));
        i2c_master_bus_rm_device(h->dev);
        free(h);
        return err;
    }

    imu->type = IMU_TYPE_BMI220;
    imu->u.bmi220 = h;
    ESP_LOGI(TAG, "BMI220 ready at 0x%02x, 50 Hz, +/-2 g, +/-250 dps", addr);
    return ESP_OK;
}

esp_err_t imu_bmi220_read(imu_t *imu, sp_motion_t *out)
{
    bmi220_handle_t *h = (bmi220_handle_t *)imu->u.bmi220;
    if (h == NULL || out == NULL) {
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t d[12];
    ESP_RETURN_ON_ERROR(read_regs(h, BMI220_REG_DATA, d, sizeof(d)), TAG, "read data");

    int16_t ax = (int16_t)((uint16_t)d[0] | ((uint16_t)d[1] << 8));
    int16_t ay = (int16_t)((uint16_t)d[2] | ((uint16_t)d[3] << 8));
    int16_t az = (int16_t)((uint16_t)d[4] | ((uint16_t)d[5] << 8));
    int16_t gx = (int16_t)((uint16_t)d[6] | ((uint16_t)d[7] << 8));
    int16_t gy = (int16_t)((uint16_t)d[8] | ((uint16_t)d[9] << 8));
    int16_t gz = (int16_t)((uint16_t)d[10] | ((uint16_t)d[11] << 8));

    if (h->zx_factor != 0) {
        gx = (int16_t)((int32_t)gx - ((int32_t)h->zx_factor * gz) / 512);
    }

    out->ax = ax / (INT16_MAX / 2.0f);
    out->ay = ay / (INT16_MAX / 2.0f);
    out->az = az / (INT16_MAX / 2.0f);
    out->gx = gx / (INT16_MAX / 250.0f);
    out->gy = gy / (INT16_MAX / 250.0f);
    out->gz = gz / (INT16_MAX / 250.0f);
    return ESP_OK;
}
