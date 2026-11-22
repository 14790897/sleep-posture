#include "imu_lsm6ds3.h"

#include "esp_log.h"

static const char *TAG = "imu_lsm6ds3";

#define REG_WHO_AM_I 0x0F
#define REG_CTRL1_XL 0x10
#define REG_CTRL2_G 0x11
#define REG_CTRL3_C 0x12
#define REG_OUTX_L_G 0x22

/* ODR 52 Hz, +/-2 g, +/-250 dps, BDU + auto-increment. */
#define CTRL1_XL_52HZ_2G 0x30
#define CTRL2_G_52HZ_250DPS 0x30
#define CTRL3_C_BDU_IF_INC 0x44

#define ACCEL_MG_PER_LSB 0.061f
#define GYRO_MDPS_PER_LSB 8.75f

static esp_err_t write_reg(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t val)
{
    uint8_t buf[2] = {reg, val};
    return i2c_master_transmit(dev, buf, sizeof(buf), 100);
}

static esp_err_t read_regs(i2c_master_dev_handle_t dev, uint8_t reg, uint8_t *data, size_t len)
{
    return i2c_master_transmit_receive(dev, &reg, 1, data, len, 100);
}

esp_err_t lsm6ds3_init(imu_t *imu, i2c_master_bus_handle_t bus, uint8_t addr)
{
    i2c_device_config_t cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = addr,
        .scl_speed_hz = 400000,
    };
    i2c_master_dev_handle_t dev = NULL;
    esp_err_t err = i2c_master_bus_add_device(bus, &cfg, &dev);
    if (err != ESP_OK) return err;

    uint8_t id = 0;
    err = read_regs(dev, REG_WHO_AM_I, &id, 1);
    if (err != ESP_OK || (id != 0x69 && id != 0x6A)) {
        i2c_master_bus_rm_device(dev);
        return err != ESP_OK ? err : ESP_ERR_NOT_FOUND;
    }

    err = write_reg(dev, REG_CTRL3_C, CTRL3_C_BDU_IF_INC);
    if (err == ESP_OK) err = write_reg(dev, REG_CTRL1_XL, CTRL1_XL_52HZ_2G);
    if (err == ESP_OK) err = write_reg(dev, REG_CTRL2_G, CTRL2_G_52HZ_250DPS);
    if (err != ESP_OK) {
        i2c_master_bus_rm_device(dev);
        return err;
    }

    imu->type = IMU_TYPE_LSM6DS3TR_C;
    imu->u.lsm6ds3.dev = dev;
    imu->u.lsm6ds3.addr = addr;
    imu->u.lsm6ds3.whoami = id;
    ESP_LOGI(TAG, "LSM6DS3 ready at 0x%02x, WHO_AM_I=0x%02x", addr, id);
    return ESP_OK;
}

esp_err_t lsm6ds3_read_scaled(imu_t *imu, sp_motion_t *out)
{
    uint8_t b[12];
    esp_err_t err = read_regs(imu->u.lsm6ds3.dev, REG_OUTX_L_G, b, sizeof(b));
    if (err != ESP_OK) return err;

    int16_t gx = (int16_t)(b[0] | (b[1] << 8));
    int16_t gy = (int16_t)(b[2] | (b[3] << 8));
    int16_t gz = (int16_t)(b[4] | (b[5] << 8));
    int16_t ax = (int16_t)(b[6] | (b[7] << 8));
    int16_t ay = (int16_t)(b[8] | (b[9] << 8));
    int16_t az = (int16_t)(b[10] | (b[11] << 8));

    out->ax = ax * ACCEL_MG_PER_LSB / 1000.0f;
    out->ay = ay * ACCEL_MG_PER_LSB / 1000.0f;
    out->az = az * ACCEL_MG_PER_LSB / 1000.0f;
    out->gx = gx * GYRO_MDPS_PER_LSB / 1000.0f;
    out->gy = gy * GYRO_MDPS_PER_LSB / 1000.0f;
    out->gz = gz * GYRO_MDPS_PER_LSB / 1000.0f;
    return ESP_OK;
}
