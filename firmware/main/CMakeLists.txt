idf_component_register(
    SRCS "main.c"
         "imu.c"
         "imu_lsm6ds3.c"
         "imu_bmi270.c"
         "imu_bmi220.c"
         "posture.c"
         "protocol.c"
         "calibration.c"
         "battery.c"
         "ble_service.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash bt driver esp_driver_i2c esp_driver_spi esp_timer esp_adc espressif__bmi270
)
