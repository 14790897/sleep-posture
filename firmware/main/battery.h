#pragma once

#include <stdint.h>

#include "esp_err.h"

esp_err_t battery_init(void);
esp_err_t battery_read_mv(int *mv);
uint8_t battery_read_percent(void);
