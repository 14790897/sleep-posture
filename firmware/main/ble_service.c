#include "ble_service.h"

#include <string.h>

#include "esp_log.h"
#include "host/ble_att.h"
#include "host/ble_gap.h"
#include "host/ble_gatt.h"
#include "host/ble_hs.h"
#include "host/util/util.h"
#include "nimble/nimble_port.h"
#include "nimble/nimble_port_freertos.h"
#include "services/gap/ble_svc_gap.h"
#include "services/gatt/ble_svc_gatt.h"

static const char *TAG = "ble";
static const char *DEVICE_NAME = "SleepPosture";

static uint8_t s_own_addr_type;
static uint16_t s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
static uint16_t s_data_handle;
static uint16_t s_status_handle;
static sp_status_t s_last_status;

static volatile uint16_t s_mtu = 23;
static volatile bool s_data_subscribed;
static volatile bool s_stream_enabled = true;
static volatile uint8_t s_notify_div = 1;
static volatile bool s_calib_request;
static volatile bool s_clear_calib_request;
static bool s_notify_warned;
static volatile bool s_last_data_notify_ok;

static ble_uuid128_t s_svc_uuid =
    BLE_UUID128_INIT(0x60, 0x5a, 0x4f, 0x3e, 0x2d, 0x1c, 0x8b, 0x9a, 0x2f, 0x4e, 0x3d, 0x4c, 0x01,
                     0x00, 0xa1, 0xb7);
static ble_uuid128_t s_ctrl_uuid =
    BLE_UUID128_INIT(0x60, 0x5a, 0x4f, 0x3e, 0x2d, 0x1c, 0x8b, 0x9a, 0x2f, 0x4e, 0x3d, 0x4c, 0x02,
                     0x00, 0xa1, 0xb7);
static ble_uuid128_t s_data_uuid =
    BLE_UUID128_INIT(0x60, 0x5a, 0x4f, 0x3e, 0x2d, 0x1c, 0x8b, 0x9a, 0x2f, 0x4e, 0x3d, 0x4c, 0x03,
                     0x00, 0xa1, 0xb7);
static ble_uuid128_t s_status_uuid =
    BLE_UUID128_INIT(0x60, 0x5a, 0x4f, 0x3e, 0x2d, 0x1c, 0x8b, 0x9a, 0x2f, 0x4e, 0x3d, 0x4c, 0x04,
                     0x00, 0xa1, 0xb7);

static int gatt_access(uint16_t conn_handle, uint16_t attr_handle,
                       struct ble_gatt_access_ctxt *ctxt, void *arg);
static int gap_event(struct ble_gap_event *event, void *arg);

static const struct ble_gatt_svc_def s_gatt_svcs[] = {
    {
        .type = BLE_GATT_SVC_TYPE_PRIMARY,
        .uuid = &s_svc_uuid.u,
        .characteristics =
            (struct ble_gatt_chr_def[]){
                {
                    .uuid = &s_ctrl_uuid.u,
                    .access_cb = gatt_access,
                    .flags = BLE_GATT_CHR_F_WRITE | BLE_GATT_CHR_F_WRITE_NO_RSP,
                },
                {
                    .uuid = &s_data_uuid.u,
                    .access_cb = gatt_access,
                    .flags = BLE_GATT_CHR_F_NOTIFY,
                    .val_handle = &s_data_handle,
                },
                {
                    .uuid = &s_status_uuid.u,
                    .access_cb = gatt_access,
                    .flags = BLE_GATT_CHR_F_READ | BLE_GATT_CHR_F_NOTIFY,
                    .val_handle = &s_status_handle,
                },
                {0},
            },
    },
    {0},
};

static int handle_control_write(struct ble_gatt_access_ctxt *ctxt)
{
    uint8_t buf[32];
    uint16_t len = OS_MBUF_PKTLEN(ctxt->om);
    if (len == 0) return BLE_ATT_ERR_INVALID_ATTR_VALUE_LEN;
    if (len > sizeof(buf)) len = sizeof(buf);
    if (os_mbuf_copydata(ctxt->om, 0, len, buf) != 0) return BLE_ATT_ERR_UNLIKELY;

    switch (buf[0]) {
    case SP_CMD_START_STREAM:
        s_stream_enabled = true;
        if (len >= 2) {
            uint8_t rate = buf[1];
            if (rate < 1) rate = 1;
            if (rate > 50) rate = 50;
            s_notify_div = (uint8_t)(50 / rate);
            if (s_notify_div < 1) s_notify_div = 1;
        }
        ESP_LOGI(TAG, "stream start, notify_div=%u", s_notify_div);
        break;
    case SP_CMD_STOP_STREAM:
        s_stream_enabled = false;
        ESP_LOGI(TAG, "stream stop");
        break;
    case SP_CMD_CALIB_GYRO:
        s_calib_request = true;
        ESP_LOGI(TAG, "gyro calibration requested");
        break;
    case SP_CMD_CLEAR_CALIB:
        s_clear_calib_request = true;
        ESP_LOGI(TAG, "clear calibration requested");
        break;
    case SP_CMD_MARK_EVENT:
    case SP_CMD_SET_LABEL:
        if (len >= 2) ESP_LOGI(TAG, "label event: %u", buf[1]);
        break;
    case SP_CMD_SET_TIME:
        ESP_LOGI(TAG, "set-time ignored in v0 (host keeps wall clock)");
        break;
    case SP_CMD_SET_RAW_MODE:
        ESP_LOGI(TAG, "raw mode command accepted (v0 always sends raw)");
        break;
    default:
        ESP_LOGW(TAG, "unknown control opcode 0x%02x", buf[0]);
        return BLE_ATT_ERR_REQ_NOT_SUPPORTED;
    }
    return 0;
}

static int gatt_access(uint16_t conn_handle, uint16_t attr_handle,
                       struct ble_gatt_access_ctxt *ctxt, void *arg)
{
    (void)conn_handle;
    (void)attr_handle;
    (void)arg;

    switch (ctxt->op) {
    case BLE_GATT_ACCESS_OP_WRITE_CHR:
        return handle_control_write(ctxt);
    case BLE_GATT_ACCESS_OP_READ_CHR:
        if (os_mbuf_append(ctxt->om, &s_last_status, sizeof(s_last_status)) != 0) {
            return BLE_ATT_ERR_INSUFFICIENT_RES;
        }
        return 0;
    default:
        return BLE_ATT_ERR_UNLIKELY;
    }
}

static void start_advertising(void)
{
    struct ble_hs_adv_fields adv = {0};
    adv.flags = BLE_HS_ADV_F_DISC_GEN | BLE_HS_ADV_F_BREDR_UNSUP;
    adv.uuids128 = &s_svc_uuid;
    adv.num_uuids128 = 1;
    adv.uuids128_is_complete = 1;

    int rc = ble_gap_adv_set_fields(&adv);
    if (rc != 0) {
        ESP_LOGE(TAG, "adv_set_fields failed: %d", rc);
        return;
    }

    struct ble_hs_adv_fields rsp = {0};
    rsp.name = (uint8_t *)DEVICE_NAME;
    rsp.name_len = strlen(DEVICE_NAME);
    rsp.name_is_complete = 1;
    ble_gap_adv_rsp_set_fields(&rsp);

    struct ble_gap_adv_params params = {0};
    params.conn_mode = BLE_GAP_CONN_MODE_UND;
    params.disc_mode = BLE_GAP_DISC_MODE_GEN;

    rc = ble_gap_adv_start(s_own_addr_type, NULL, BLE_HS_FOREVER, &params, gap_event, NULL);
    if (rc != 0 && rc != BLE_HS_EALREADY) {
        ESP_LOGE(TAG, "adv_start failed: %d", rc);
    }
}

static int gap_event(struct ble_gap_event *event, void *arg)
{
    (void)arg;
    switch (event->type) {
    case BLE_GAP_EVENT_CONNECT:
        if (event->connect.status == 0) {
            s_conn_handle = event->connect.conn_handle;
            s_mtu = 23;
            s_data_subscribed = false;
            s_notify_warned = false;
            ESP_LOGI(TAG, "connected, conn_handle=%u", s_conn_handle);
        } else {
            ESP_LOGW(TAG, "connect failed status=%d", event->connect.status);
            start_advertising();
        }
        break;
    case BLE_GAP_EVENT_DISCONNECT:
        ESP_LOGI(TAG, "disconnected reason=%d", event->disconnect.reason);
        s_conn_handle = BLE_HS_CONN_HANDLE_NONE;
        s_mtu = 23;
        s_data_subscribed = false;
        start_advertising();
        break;
    case BLE_GAP_EVENT_ADV_COMPLETE:
        start_advertising();
        break;
    case BLE_GAP_EVENT_MTU:
        s_mtu = event->mtu.value;
        ESP_LOGI(TAG, "mtu updated: %u", s_mtu);
        break;
    case BLE_GAP_EVENT_SUBSCRIBE:
        if (event->subscribe.attr_handle == s_data_handle) {
            s_data_subscribed = event->subscribe.cur_notify;
            ESP_LOGI(TAG, "data notify subscription: %d", s_data_subscribed);
        }
        break;
    default:
        break;
    }
    return 0;
}

static void on_sync(void)
{
    ble_hs_util_ensure_addr(0);
    ble_hs_id_infer_auto(0, &s_own_addr_type);
    ble_att_set_preferred_mtu(247);
    start_advertising();
}

static void on_reset(int reason)
{
    ESP_LOGW(TAG, "host reset, reason=%d", reason);
}

static void host_task(void *param)
{
    (void)param;
    nimble_port_run();
    nimble_port_freertos_deinit();
}

esp_err_t sp_ble_init(void)
{
    esp_err_t err = nimble_port_init();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nimble_port_init failed: %s", esp_err_to_name(err));
        return err;
    }

    ble_hs_cfg.reset_cb = on_reset;
    ble_hs_cfg.sync_cb = on_sync;

    ble_svc_gap_init();
    ble_svc_gatt_init();

    int rc = ble_gatts_count_cfg(s_gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_count_cfg failed: %d", rc);
        return ESP_FAIL;
    }
    rc = ble_gatts_add_svcs(s_gatt_svcs);
    if (rc != 0) {
        ESP_LOGE(TAG, "ble_gatts_add_svcs failed: %d", rc);
        return ESP_FAIL;
    }

    ble_svc_gap_device_name_set(DEVICE_NAME);
    nimble_port_freertos_init(host_task);
    return ESP_OK;
}

bool sp_ble_stream_enabled(void)
{
    return s_stream_enabled;
}

uint8_t sp_ble_notify_div(void)
{
    return s_notify_div;
}

bool sp_ble_take_calib_request(void)
{
    bool v = s_calib_request;
    s_calib_request = false;
    return v;
}

bool sp_ble_take_clear_calib_request(void)
{
    bool v = s_clear_calib_request;
    s_clear_calib_request = false;
    return v;
}

esp_err_t sp_ble_notify_data(const sp_frame_t *frame)
{
    if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE || s_data_handle == 0) {
        s_last_data_notify_ok = false;
        return ESP_ERR_INVALID_STATE;
    }
    /* 24-byte frame needs ATT MTU >= 27 (3-byte notification header). */
    if (s_mtu < 27) {
        uint16_t mtu = ble_att_mtu(s_conn_handle);
        if (mtu >= 27) s_mtu = mtu;
    }
    if (s_mtu < 27) {
        s_last_data_notify_ok = false;
        return ESP_ERR_INVALID_STATE;
    }
    struct os_mbuf *om = ble_hs_mbuf_from_flat(frame, sizeof(*frame));
    if (om == NULL) {
        s_last_data_notify_ok = false;
        return ESP_ERR_NO_MEM;
    }
    int rc = ble_gatts_notify_custom(s_conn_handle, s_data_handle, om);
    s_last_data_notify_ok = (rc == 0);
    if (rc != 0) {
        if (!s_notify_warned) {
            ESP_LOGW(TAG, "notify failed rc=%d (MTU=%u subscribed=%d)", rc, s_mtu,
                     s_data_subscribed);
            s_notify_warned = true;
        }
        return ESP_FAIL;
    }
    return ESP_OK;
}

esp_err_t sp_ble_notify_status(const sp_status_t *status)
{
    sp_status_t out = *status;
    uint16_t mtu = s_mtu;
    uint8_t diag = 0;
    if (mtu >= 27) diag |= 0x01;
    if (s_data_subscribed) diag |= 0x02;
    if (s_data_handle != 0) diag |= 0x04;
    if (s_last_data_notify_ok) diag |= 0x08;
    diag |= (uint8_t)(((mtu > 240) ? 15 : (mtu / 16)) << 4);
    out.reserved = diag;
    s_last_status = out;

    if (s_conn_handle == BLE_HS_CONN_HANDLE_NONE || s_status_handle == 0) {
        return ESP_ERR_INVALID_STATE;
    }
    struct os_mbuf *om = ble_hs_mbuf_from_flat(&out, sizeof(out));
    if (om == NULL) return ESP_ERR_NO_MEM;
    int rc = ble_gatts_notify_custom(s_conn_handle, s_status_handle, om);
    return rc == 0 ? ESP_OK : ESP_FAIL;
}
