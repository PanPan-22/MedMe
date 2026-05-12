import { BackHeader } from "@/components/back-header";
import { Schedule } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import { useSecureStorage } from "@/hooks/use-securestore";
import { getWeeklySlotRules, SlotRule } from "@/lib/med-sort";
import {
  connectAndDiscover,
  disconnect as bleDisconnect,
  DeviceRule,
  fireSlot as bleFireSlot,
  ping as blePing,
  pushSchedule as blePushSchedule,
  readState,
  scanForPillbox,
  waitForPoweredOn,
} from "@/lib/pillbox-ble";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Device } from "react-native-ble-plx";

const MAX_SLOTS = 8;

const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark: { primary: "#86efac", background: "#0a1410" },
};

type ConnectionStatus = "unknown" | "connecting" | "connected" | "not_connected";

function formatHM(hour: number, minute: number, locale: string): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function formatDayMask(mask: number, t: (k: string) => string): string {
  if (mask === 127) return t("pillbox_days_daily");
  if (mask === 62) return t("pillbox_days_weekdays");
  if (mask === 65) return t("pillbox_days_weekends");
  const out: string[] = [];
  if (mask & 2) out.push(t("day_mon"));
  if (mask & 4) out.push(t("day_tue"));
  if (mask & 8) out.push(t("day_wed"));
  if (mask & 16) out.push(t("day_thu"));
  if (mask & 32) out.push(t("day_fri"));
  if (mask & 64) out.push(t("day_sat"));
  if (mask & 1) out.push(t("day_sun"));
  return out.join(", ");
}

// Local "Unix-like" timestamp in seconds: utc + offset. The Arduino's RTC
// stores these broken-down components verbatim, so its hour/minute/day-of-week
// match the patient's local time without any tz handling on the device.
function localEpochNow(): number {
  return Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60;
}

// Android 12+ needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT at runtime. Older
// Android versions needed ACCESS_FINE_LOCATION for scanning; the ble-plx
// plugin adds it to the manifest with neverForLocation:false fallback.
async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  const apiLevel = (Platform.Version as number) ?? 0;
  const required: any[] = [];
  if (apiLevel >= 31) {
    required.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    );
  } else {
    required.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }
  if (required.length === 0) return true;
  const results = await PermissionsAndroid.requestMultiple(required);
  return required.every(
    (p) => (results as Record<string, string>)[p] === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export default function PillboxSetupScreen() {
  const { t, i18n } = useTranslation();
  const { colorScheme } = useColorScheme();
  const { showToast } = useToast();
  const db = useSQLiteContext();
  const { patientId, patientName } = useLocalSearchParams<{ patientId?: string; patientName?: string }>();
  const pid = patientId ? parseInt(patientId) : null;

  const scheme = colorScheme === "dark" ? "dark" : "light";
  const primaryColor = THEME_COLORS[scheme].primary;
  const bgColor = THEME_COLORS[scheme].background;

  const { getValue } = useSecureStorage();

  const [status, setStatus] = useState<ConnectionStatus>("unknown");
  const [sending, setSending] = useState(false);
  const [slotRules, setSlotRules] = useState<SlotRule[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [pillboxRules, setPillboxRules] = useState<DeviceRule[] | null>(null);
  const [firingSlot, setFiringSlot] = useState<number | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Holds the currently-connected pillbox device. A ref (not state) because
  // the BLE handle isn't a render-relevant value — its presence is reflected
  // by `status`.
  const deviceRef = useRef<Device | null>(null);

  useEffect(() => {
    getValue("debugNotifications").then((v) => setDebugEnabled(v === "true"));
  }, []);

  const loadRules = useCallback(async () => {
    const meds = pid != null
      ? await db.getAllAsync<Schedule>(
          "SELECT * FROM schedules WHERE patient_id = ?",
          [pid],
        )
      : await db.getAllAsync<Schedule>(
          "SELECT * FROM schedules WHERE patient_id IS NULL",
        );
    setSlotRules(getWeeklySlotRules(meds));
  }, [db, pid]);

  useFocusEffect(
    useCallback(() => {
      loadRules();
    }, [loadRules]),
  );

  // Scan + connect + verify (ping + state). One atomic operation.
  const connectFlow = useCallback(async () => {
    setConnectError(null);
    setStatus("connecting");
    try {
      const granted = await requestBlePermissions();
      if (!granted) {
        setConnectError(t("pillbox_permission_required"));
        setStatus("not_connected");
        return;
      }
      const powered = await waitForPoweredOn();
      if (!powered) {
        setConnectError(t("pillbox_bluetooth_off"));
        setStatus("not_connected");
        return;
      }
      // Drop any prior connection so we don't leak handles on reconnect.
      if (deviceRef.current) {
        await bleDisconnect(deviceRef.current);
        deviceRef.current = null;
      }
      const found = await scanForPillbox();
      if (!found) {
        setConnectError(t("pillbox_connect_timeout"));
        setStatus("not_connected");
        return;
      }
      const connected = await connectAndDiscover(found);
      deviceRef.current = connected;
      const ok = await blePing(connected);
      if (!ok) {
        setConnectError(t("pillbox_connect_failed"));
        setStatus("not_connected");
        return;
      }
      const state = await readState(connected);
      setPillboxRules(state.rules);
      setStatus("connected");
    } catch (e: any) {
      console.warn("[pillbox-ble] connect flow failed", e);
      setConnectError(t("pillbox_connect_failed"));
      setStatus("not_connected");
      setPillboxRules(null);
    }
  }, [t]);

  // Quick re-read of current state on an already-connected device. Used by
  // the refresh button when we believe we're connected.
  const refreshState = useCallback(async () => {
    if (!deviceRef.current) {
      await connectFlow();
      return;
    }
    setStatus("connecting");
    try {
      const state = await readState(deviceRef.current);
      setPillboxRules(state.rules);
      setStatus("connected");
    } catch (e) {
      console.warn("[pillbox-ble] refresh failed", e);
      // Likely got disconnected silently — fall back to a full reconnect.
      deviceRef.current = null;
      await connectFlow();
    }
  }, [connectFlow]);

  // Try to connect on focus. Disconnect on unmount so the radio is freed.
  useFocusEffect(
    useCallback(() => {
      connectFlow();
      return () => {
        const d = deviceRef.current;
        deviceRef.current = null;
        if (d) bleDisconnect(d);
      };
    }, [connectFlow]),
  );

  // Active rules on the device — those with a non-zero dayMask.
  const armedDevice = pillboxRules
    ? pillboxRules
        .filter((r) => r.dayMask > 0)
        .map((r) => {
          const matching = slotRules.find((s) => s.hour === r.hour && s.minute === r.minute);
          return { ...r, meds: matching?.meds ?? [] };
        })
    : [];
  const armedOnDevice = armedDevice.length;

  const overCapacity = slotRules.length > MAX_SLOTS;

  // User-controllable selection of which rules to push (default = first 8).
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set());
  const ruleTimesKey = slotRules.map((r) => r.time).join("|");
  useEffect(() => {
    setSelectedTimes(new Set(slotRules.slice(0, MAX_SLOTS).map((r) => r.time)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleTimesKey]);

  const selectedRules = slotRules.filter((r) => selectedTimes.has(r.time));
  const slotNumByTime = new Map<string, number>();
  selectedRules.forEach((r, i) => slotNumByTime.set(r.time, i + 1));

  const toggleRule = (time: string) => {
    setSelectedTimes((prev) => {
      const next = new Set(prev);
      if (next.has(time)) {
        next.delete(time);
      } else {
        if (next.size >= MAX_SLOTS) {
          showToast(t("pillbox_select_max", { count: MAX_SLOTS }), "error");
          return prev;
        }
        next.add(time);
      }
      return next;
    });
  };

  const fireTest = async (slot: number) => {
    if (!deviceRef.current) {
      showToast(t("pillbox_send_failed"), "error");
      return;
    }
    setFiringSlot(slot);
    try {
      await bleFireSlot(deviceRef.current, slot);
      showToast(t("pillbox_test_sent", { n: slot }));
    } catch (e) {
      console.warn("[pillbox-ble] fire test failed", e);
      setStatus("not_connected");
      showToast(t("pillbox_send_failed"), "error");
    } finally {
      setFiringSlot(null);
    }
  };

  const sendPlan = async () => {
    if (!deviceRef.current) {
      showToast(t("pillbox_send_failed"), "error");
      return;
    }
    if (selectedRules.length === 0) {
      showToast(t("pillbox_nothing_to_push"), "error");
      return;
    }
    setSending(true);
    try {
      const now = localEpochNow();
      const payload = selectedRules.map((r, i) => ({
        slot: i + 1,
        hour: r.hour,
        minute: r.minute,
        dayMask: r.dayMask,
      }));
      await blePushSchedule(deviceRef.current, now, payload);
      showToast(t("pillbox_sent"));
      // Re-read state to confirm what landed on the device.
      try {
        const state = await readState(deviceRef.current);
        setPillboxRules(state.rules);
      } catch { /* state read non-critical */ }
    } catch (e) {
      console.warn("[pillbox-ble] schedule push failed", e);
      setStatus("not_connected");
      showToast(t("pillbox_send_failed"), "error");
    } finally {
      setSending(false);
    }
  };

  const statusLabel =
    status === "connected"
      ? t("pillbox_status_connected")
      : status === "connecting"
        ? t("pillbox_connecting")
        : status === "not_connected"
          ? t("pillbox_status_not_connected")
          : t("pillbox_status_unknown");

  const statusDot =
    status === "connected"
      ? "bg-green-500"
      : status === "not_connected"
        ? "bg-red-500"
        : "bg-primary/40";

  const busy = status === "connecting" || sending;
  const locale = i18n.resolvedLanguage ?? "en";

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("pillbox_setup") }} />
      <BackHeader title={patientName ? `${t("pillbox_setup")} · ${patientName}` : t("pillbox_setup")} />
      <ScrollView
        className="px-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
      <View className="px-2 py-4">
        <Text className="text-primary/60 text-sm mb-4">{t("pillbox_ble_instructions")}</Text>

        <Text className="text-primary font-semibold mb-2 text-base">{t("pillbox_status")}</Text>
        <View className="flex-row items-center justify-between bg-card border border-primary/20 rounded-2xl px-4 py-3">
          <View className="flex-row items-center gap-2 flex-1 mr-2">
            <View className={`w-3 h-3 rounded-full ${statusDot}`} />
            <Text className="text-primary text-base flex-1" numberOfLines={1}>
              {statusLabel}
              {status === "connected" && pillboxRules
                ? ` · ${t("pillbox_armed_count", { count: armedOnDevice })}`
                : ""}
            </Text>
          </View>
          <Pressable
            onPress={refreshState}
            disabled={busy}
            hitSlop={12}
            accessibilityLabel={t("pillbox_refresh_status")}
            className="active:opacity-70"
          >
            {status === "connecting" ? (
              <ActivityIndicator color={primaryColor} />
            ) : (
              <Ionicons name="refresh" size={20} color={primaryColor} />
            )}
          </Pressable>
        </View>

        {status === "not_connected" && (
          <View className="mt-3 gap-2">
            <Pressable
              onPress={connectFlow}
              disabled={busy}
              className="active:opacity-70 flex-row items-center justify-center gap-2 bg-primary rounded-2xl p-3 disabled:opacity-50"
            >
              <Ionicons name="bluetooth" size={18} color={bgColor} />
              <Text className="text-background font-semibold">{t("pillbox_connect")}</Text>
            </Pressable>
            {connectError && (
              <Text className="text-red-500 text-sm text-center px-2">{connectError}</Text>
            )}
          </View>
        )}

        {status === "connected" && armedDevice.length > 0 && (
          <View className="mt-3 gap-1">
            <Text className="text-primary/60 text-xs uppercase tracking-wide mb-1">
              {t("pillbox_armed_on_device")}
            </Text>
            {armedDevice.map((r) => (
              <View
                key={r.slot}
                className="flex-row items-center justify-between bg-card border border-primary/10 rounded-xl px-3 py-2 gap-3"
              >
                <View className="flex-row items-center gap-2 flex-1">
                  <View className="bg-primary/10 rounded-full w-7 h-7 items-center justify-center">
                    <Text className="text-primary font-bold text-xs">{r.slot}</Text>
                  </View>
                  <View className="flex-1">
                    {r.meds.length > 0 ? (
                      <Text className="text-primary text-sm" numberOfLines={1}>
                        {r.meds.map((m) => m.medicine_name).join(", ")}
                      </Text>
                    ) : (
                      <Text className="text-primary/40 text-sm italic" numberOfLines={1}>
                        {t("pillbox_armed_unknown_med")}
                      </Text>
                    )}
                    <Text className="text-primary/60 text-xs">{formatDayMask(r.dayMask, t)}</Text>
                  </View>
                </View>
                <Text className="text-primary/70 text-sm">
                  {formatHM(r.hour, r.minute, locale)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View className="border-b border-muted" />

      <View className="px-2 py-4">
        <View className="flex-row items-center justify-between mb-2">
          <Text className="text-primary font-semibold text-base">{t("pillbox_weekly_plan")}</Text>
          {slotRules.length > 0 && (
            <Text className="text-primary/60 text-sm">
              {t("pillbox_doses_summary", {
                remaining: selectedRules.length,
                total: slotRules.length,
              })}
            </Text>
          )}
        </View>

        {overCapacity && (
          <View className="bg-yellow-100 border border-yellow-300 rounded-2xl px-4 py-3 mb-3 flex-row items-start gap-2">
            <Ionicons name="warning-outline" size={18} color="#a16207" />
            <Text className="text-yellow-900 text-sm flex-1">
              {t("pillbox_capacity_warning", { count: slotRules.length })}
            </Text>
          </View>
        )}

        {slotRules.length === 0 ? (
          <Text className="text-primary/60 text-sm py-4">{t("pillbox_no_doses_today")}</Text>
        ) : (
          <View className="gap-2 mb-4">
            {slotRules.map((r, idx) => {
              const slotNum = slotNumByTime.get(r.time);
              const selected = selectedTimes.has(r.time);
              return (
                <Pressable
                  key={`${r.time}-${idx}`}
                  onPress={() => toggleRule(r.time)}
                  className={`active:opacity-70 flex-row items-start justify-between border rounded-2xl px-4 py-3 ${
                    selected ? "bg-primary/10 border-primary" : "bg-card border-primary/20"
                  }`}
                >
                  <View className="flex-row items-start gap-3 flex-1">
                    <View
                      className={`rounded-full w-10 h-10 items-center justify-center ${
                        selected && slotNum ? "bg-primary" : "bg-primary/10"
                      }`}
                    >
                      {slotNum ? (
                        <Text className={`font-bold ${selected ? "text-background" : "text-primary"}`}>
                          {slotNum}
                        </Text>
                      ) : (
                        <Ionicons name="time-outline" size={18} color={primaryColor} />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-primary font-semibold">
                        {formatHM(r.hour, r.minute, locale)} · {formatDayMask(r.dayMask, t)}
                      </Text>
                      <Text className="text-primary/60 text-sm" numberOfLines={2}>
                        {r.meds.map((m) => m.medicine_name).join(", ")}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={selected ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={selected ? primaryColor : "#888"}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={sendPlan}
          disabled={sending || selectedRules.length === 0 || status !== "connected"}
          className={`active:opacity-70 items-center justify-center rounded-2xl p-4 ${
            sending || selectedRules.length === 0 || status !== "connected" ? "bg-primary/50" : "bg-primary"
          }`}
        >
          {sending ? (
            <ActivityIndicator color={bgColor} />
          ) : (
            <Text className="text-background font-bold text-base">{t("pillbox_send")}</Text>
          )}
        </Pressable>
      </View>

      {debugEnabled && (
        <>
          <View className="border-b border-muted" />
          <View className="px-2 py-4 mb-8">
            <Text className="text-primary font-semibold mb-1 text-base">{t("pillbox_debug_heading")}</Text>
            <Text className="text-primary/60 text-sm mb-3">{t("pillbox_test_fire")}</Text>
            <View className="flex-row flex-wrap gap-2">
              {[1, 5, 2, 6, 3, 7, 4, 8].map((slot) => {
                const busyHere = firingSlot === slot;
                const disabled = firingSlot !== null || status !== "connected";
                return (
                  <Pressable
                    key={slot}
                    onPress={() => fireTest(slot)}
                    disabled={disabled}
                    className={`active:opacity-70 items-center justify-center rounded-2xl border border-primary py-4 ${
                      disabled && !busyHere ? "opacity-40" : ""
                    }`}
                    style={{ width: "48%" }}
                  >
                    {busyHere ? (
                      <ActivityIndicator color={primaryColor} />
                    ) : (
                      <Text className="text-primary font-bold text-base">
                        {t("pillbox_slot_n", { n: slot })}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </>
      )}
      </ScrollView>
    </View>
  );
}
