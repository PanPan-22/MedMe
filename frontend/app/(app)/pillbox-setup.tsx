import { BackHeader } from "@/components/back-header";
import { Schedule } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import { useSecureStorage } from "@/hooks/use-securestore";
import { getWeeklySlotRules, SlotRule } from "@/lib/med-sort";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Linking from "expo-linking";
import { Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useState } from "react";
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
import WifiManager from "react-native-wifi-reborn";

const PILLBOX_HOST = "http://192.168.4.1";
const REQUEST_TIMEOUT_MS = 5000;
const WIFI_CONNECT_TIMEOUT_MS = 15000;
const MAX_SLOTS = 8;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark: { primary: "#86efac", background: "#0a1410" },
};

type ConnectionStatus = "unknown" | "connected" | "not_connected";

interface DeviceRule {
  slot: number;       // 1-based
  hour: number;
  minute: number;
  dayMask: number;
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

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

// Local "Unix-like" timestamp in seconds: utc + offset. The Arduino's RTC stores
// these broken-down components verbatim, so its hour/minute/day-of-week match
// the patient's local time without any tz handling on the device.
function localEpochNow(): number {
  return Math.floor(Date.now() / 1000) - new Date().getTimezoneOffset() * 60;
}

// Open the OS Wi-Fi settings screen so the user can join Pillbox_001.
// Android has a stable intent. iOS used to support `App-Prefs:root=WIFI` but
// Apple has tightened on this — fall back to the app settings screen, which
// is the most we can reliably do.
async function openWifiSettings(): Promise<void> {
  if (Platform.OS === "android") {
    try {
      await Linking.sendIntent("android.settings.WIFI_SETTINGS");
      return;
    } catch (e) {
      console.warn("openWifiSettings: Android intent failed", e);
    }
  } else if (Platform.OS === "ios") {
    try {
      const url = "App-Prefs:root=WIFI";
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch (e) {
      console.warn("openWifiSettings: iOS deep link failed", e);
    }
  }
  try { await Linking.openSettings(); } catch (e) { console.warn("openSettings failed", e); }
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
  const [testing, setTesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [slotRules, setSlotRules] = useState<SlotRule[]>([]);
  const [debugEnabled, setDebugEnabled] = useState(false);

  useEffect(() => {
    getValue("debugNotifications").then((v) => setDebugEnabled(v === "true"));
  }, []);

  // Release the app's Wi-Fi binding when leaving this screen so Firestore /
  // other network calls go back through home Wi-Fi or cellular. Without this,
  // the app stays locked to the pillbox AP (no internet) until restart.
  useEffect(() => {
    return () => {
      if (Platform.OS === "android") {
        WifiManager.forceWifiUsageWithOptions(false, { noInternet: false }).catch(() => {});
      }
    };
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

  // Mirror of what's actually scheduled on the device, fetched via /state.
  const [pillboxRules, setPillboxRules] = useState<DeviceRule[] | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Auto-join any nearby "Pillbox_*" Wi-Fi AP. Android-only — iOS requires
  // the paid Apple Developer "Hotspot Configuration" entitlement.
  const connectToPillbox = async () => {
    setConnectError(null);
    if (Platform.OS !== "android") {
      setConnectError(t("pillbox_connect_ios_unsupported"));
      openWifiSettings();
      return;
    }
    setConnecting(true);
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      );
      if (granted === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
        // User permanently denied — only recoverable via app Settings.
        setConnectError(t("pillbox_permission_required"));
        Linking.openSettings();
        return;
      }
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setConnectError(t("pillbox_permission_required"));
        return;
      }
      await withTimeout(
        WifiManager.connectToSSIDPrefix("Pillbox_"),
        WIFI_CONNECT_TIMEOUT_MS,
        "wifi-connect",
      );
      // Bind this app's traffic to the just-joined network. Without this, the
      // phone's home Wi-Fi may still be the default route and our fetches
      // would silently miss the pillbox at 192.168.4.1. noInternet: true tells
      // Android the pillbox AP has no internet, so it doesn't fall back to
      // cellular for our requests.
      try {
        await WifiManager.forceWifiUsageWithOptions(true, { noInternet: true });
      } catch { /* ignore */ }
      await testConnection();
    } catch (e: any) {
      console.warn("[pillbox] auto-connect failed", e);
      const isTimeout = String(e?.message ?? "").includes("timeout");
      setConnectError(isTimeout ? t("pillbox_connect_timeout") : t("pillbox_connect_failed"));
    } finally {
      setConnecting(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await fetchWithTimeout(`${PILLBOX_HOST}/state`, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      const parsed: DeviceRule[] = Array.isArray(body?.rules) ? body.rules : [];
      setPillboxRules(parsed);
      setStatus("connected");
    } catch {
      setStatus("not_connected");
      setPillboxRules(null);
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

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

  const [firingSlot, setFiringSlot] = useState<number | null>(null);
  const fireTest = async (slot: number) => {
    setFiringSlot(slot);
    try {
      const res = await fetchWithTimeout(`${PILLBOX_HOST}/fire?slot=${slot}`, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus("connected");
      showToast(t("pillbox_test_sent", { n: slot }));
    } catch {
      setStatus("not_connected");
      showToast(t("pillbox_send_failed"), "error");
    } finally {
      setFiringSlot(null);
    }
  };

  const sendPlan = async () => {
    if (selectedRules.length === 0) {
      showToast(t("pillbox_nothing_to_push"), "error");
      return;
    }
    const now = localEpochNow();
    // Format: slot:HH:MM:mask,slot:HH:MM:mask,...
    const rulesCsv = selectedRules
      .map((r, i) => `${i + 1}:${r.hour}:${r.minute}:${r.dayMask}`)
      .join(",");

    setSending(true);
    try {
      const url = `${PILLBOX_HOST}/schedule?now=${now}&rules=${rulesCsv}`;
      const res = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (!res.ok) throw new Error(`status ${res.status}`);
      setStatus("connected");
      showToast(t("pillbox_sent"));
      testConnection();
    } catch {
      setStatus("not_connected");
      showToast(t("pillbox_send_failed"), "error");
    } finally {
      setSending(false);
    }
  };

  const statusLabel =
    status === "connected"
      ? t("pillbox_status_connected")
      : status === "not_connected"
        ? t("pillbox_status_not_connected")
        : t("pillbox_status_unknown");

  const statusDot =
    status === "connected"
      ? "bg-green-500"
      : status === "not_connected"
        ? "bg-red-500"
        : "bg-primary/40";

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
        <Text className="text-primary/60 text-sm mb-4">{t("pillbox_wifi_instructions")}</Text>

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
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={openWifiSettings}
              hitSlop={12}
              accessibilityLabel={t("pillbox_open_wifi_settings")}
              className="active:opacity-70"
            >
              <Ionicons name="wifi" size={20} color={primaryColor} />
            </Pressable>
            {status !== "not_connected" && (
            <Pressable
              onPress={testConnection}
              disabled={testing}
              hitSlop={12}
              accessibilityLabel={t("pillbox_refresh_status")}
              className="active:opacity-70"
            >
              {testing ? (
                <ActivityIndicator color={primaryColor} />
              ) : (
                <Ionicons name="refresh" size={20} color={primaryColor} />
              )}
            </Pressable>
            )}
          </View>
        </View>

        {status === "not_connected" && (
          <View className="mt-3 gap-2">
            <Pressable
              onPress={connectToPillbox}
              disabled={connecting}
              className="active:opacity-70 flex-row items-center justify-center gap-2 bg-primary rounded-2xl p-3 disabled:opacity-50"
            >
              {connecting ? (
                <ActivityIndicator color={bgColor} />
              ) : (
                <Ionicons name="wifi" size={18} color={bgColor} />
              )}
              <Text className="text-background font-semibold">
                {connecting ? t("pillbox_connecting") : t("pillbox_connect")}
              </Text>
            </Pressable>
            {connectError && (
              <Text className="text-red-500 text-sm text-center px-2">
                {connectError}
              </Text>
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
          disabled={sending || selectedRules.length === 0}
          className={`active:opacity-70 items-center justify-center rounded-2xl p-4 ${
            sending || selectedRules.length === 0 ? "bg-primary/50" : "bg-primary"
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
                const busy = firingSlot === slot;
                const disabled = firingSlot !== null;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => fireTest(slot)}
                    disabled={disabled}
                    className={`active:opacity-70 items-center justify-center rounded-2xl border border-primary py-4 ${
                      disabled && !busy ? "opacity-40" : ""
                    }`}
                    style={{ width: "48%" }}
                  >
                    {busy ? (
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
