#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "protocol.h"

esp_err_t sp_ble_init(void);

bool sp_ble_stream_enabled(void);
uint8_t sp_ble_notify_div(void);
bool sp_ble_take_calib_request(void);
bool sp_ble_take_clear_calib_request(void);

esp_err_t sp_ble_notify_data(const sp_frame_t *frame);
esp_err_t sp_ble_notify_status(const sp_status_t *status);
