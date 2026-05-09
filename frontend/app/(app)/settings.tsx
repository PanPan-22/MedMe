import { BackHeader } from "@/components/back-header";
import { ConfirmModal } from "@/components/confirm-modal";
import { CaretakerLinkSection, PairingSection } from "@/components/pairing-section";
import { useToast } from "@/context/toast-context";
import { deleteAccountFirestore } from "@/db/firestore-ops";
import { writeSnapshot } from "@/db/snapshot";
import { flushOutboxOnce } from "@/hooks/use-sync-engine";
import {
  cancelNotificationsForMed,
  getSelectedSoundIndex,
  setSelectedSoundIndex,
  SOUND_FILES,
  SOUND_SOURCES,
} from "@/hooks/use-notifications";
import { useSecureStorage } from "@/hooks/use-securestore";
import { useClerk, useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { AudioPlayer, createAudioPlayer } from "expo-audio";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { router, Stack } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SheetManager } from "react-native-actions-sheet";

const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark:  { primary: "#86efac", background: "#0a1410" },
};

export default function SettingsScreen() {
  const { save } = useSecureStorage();
  const { signOut } = useClerk();
  const { user } = useUser();
  const db = useSQLiteContext();
  const { colorScheme, setColorScheme } = useColorScheme();
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();

  const currentLanguage = i18n.resolvedLanguage;
  const scheme = colorScheme === "dark" ? "dark" : "light";
  const primaryColor = THEME_COLORS[scheme].primary;
  const bgColor = THEME_COLORS[scheme].background;

  const meta = (user?.unsafeMetadata ?? {}) as { firstName?: string; lastName?: string; role?: string };
  const [firstName, setFirstName] = useState(meta.firstName ?? user?.firstName ?? "");
  const [lastName, setLastName] = useState(meta.lastName ?? user?.lastName ?? "");
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [simpleUi, setSimpleUi] = useState(false);
  const [debugNotifications, setDebugNotifications] = useState(false);
  const [notifPermission, setNotifPermission] = useState<"granted" | "denied" | "unknown">("unknown");
  const [soundIndex, setSoundIndex] = useState<number>(1);
  const [showSoundPicker, setShowSoundPicker] = useState(false);

  const { getValue } = useSecureStorage();
  useEffect(() => {
    getValue("simpleUi").then((v) => setSimpleUi(v === "true"));
    getValue("debugNotifications").then((v) => setDebugNotifications(v === "true"));
    getSelectedSoundIndex().then(setSoundIndex);
  }, []);

  const refreshNotifPermission = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifPermission(status === "granted" ? "granted" : "denied");
  };

  useEffect(() => {
    refreshNotifPermission();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") refreshNotifPermission();
    });
    return () => sub.remove();
  }, []);

  const previewPlayerRef = useRef<AudioPlayer | null>(null);
  const previewStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPreview = () => {
    if (previewStopTimer.current) {
      clearTimeout(previewStopTimer.current);
      previewStopTimer.current = null;
    }
    if (previewPlayerRef.current) {
      try { previewPlayerRef.current.pause(); } catch { /* ignore */ }
      try { previewPlayerRef.current.release(); } catch { /* ignore */ }
      previewPlayerRef.current = null;
    }
  };

  useEffect(() => {
    return () => stopPreview();
  }, []);

  const closeSoundPicker = () => {
    stopPreview();
    setShowSoundPicker(false);
  };

  const selectSound = async (index: number) => {
    setSoundIndex(index);
    await setSelectedSoundIndex(index);

    // Fresh player each preview — avoids audio-session state getting stuck after pause.
    stopPreview();
    try {
      const player = createAudioPlayer(SOUND_SOURCES[index]);
      previewPlayerRef.current = player;
      player.play();
      previewStopTimer.current = setTimeout(() => stopPreview(), 3000);
    } catch (e) {
      console.warn("sound preview failed", e);
    }
  };

  const toggleSimpleUi = async (val: boolean) => {
    setSimpleUi(val);
    await save("simpleUi", val ? "true" : "false");
  };

  const toggleDebugNotifications = async (val: boolean) => {
    setDebugNotifications(val);
    await save("debugNotifications", val ? "true" : "false");
  };

  useEffect(() => {
    if (!user) return;
    setFirstName(meta.firstName ?? user.firstName ?? "");
    setLastName(meta.lastName ?? user.lastName ?? "");
  }, [user, meta.firstName, meta.lastName]);

  const pickImage = async () => {
    const result = (await SheetManager.show("image-picker-sheet", { payload: { aspect: [1, 1] } })) as { uri: string } | undefined;
    if (result?.uri) setLocalImageUri(result.uri);
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await user.update({
        unsafeMetadata: {
          ...(user.unsafeMetadata ?? {}),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        },
      });
      if (localImageUri) {
        const ext = localImageUri.split(".").pop()?.toLowerCase();
        const mime = ext === "png" ? "image/png" : "image/jpeg";
        await user.setProfileImage({
          file: { uri: localImageUri, name: `profile.${ext ?? "jpg"}`, type: mime } as any,
        });
        setLocalImageUri(null);
      }
      showToast(t("profile_saved"));
    } catch (e: any) {
      console.warn("profile update failed:", e?.errors ?? e?.message ?? e);
      showToast(e?.errors?.[0]?.longMessage ?? e?.message ?? t("profile_save_error"), "error");
    } finally {
      setSaving(false);
    }
  };

  const profileChanged =
    firstName.trim() !== (meta.firstName ?? user?.firstName ?? "") ||
    lastName.trim() !== (meta.lastName ?? user?.lastName ?? "") ||
    localImageUri !== null;

  const displayImage = localImageUri ?? user?.imageUrl;
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;

  const handleDeleteAccount = async () => {
    if (!user) return;
    setDeleteConfirmVisible(false);
    setDeleting(true);
    try {
      const schedules = await db.getAllAsync<{ notification_id: string | null }>(
        `SELECT notification_id FROM schedules WHERE notification_id IS NOT NULL`,
      );
      for (const s of schedules) {
        if (s.notification_id) {
          try { await cancelNotificationsForMed(s.notification_id); } catch { /* ignore */ }
        }
      }

      if (role) {
        try { await deleteAccountFirestore(user.id, role); } catch (e) { console.warn("firestore cleanup failed", e); }
      }

      await db.execAsync(`
        DELETE FROM schedules;
        DELETE FROM logs;
        DELETE FROM patients;
        DELETE FROM patient_links;
        DELETE FROM outbox;
        DELETE FROM inbox_processed;
      `);

      await user.delete();
      showToast(t("account_deleted"));
    } catch (e: any) {
      console.warn("account delete failed:", e?.errors ?? e?.message ?? e);
      showToast(e?.errors?.[0]?.longMessage ?? e?.message ?? t("account_delete_failed"), "error");
      setDeleting(false);
    }
  };

  const toggleTheme = async (theme: "light" | "dark") => {
    setColorScheme(theme);
    await save("colorScheme", theme);
  };

  const selectedCls = "bg-primary border-primary";
  const unselectedCls = "bg-transparent border-primary/40";

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: true, title: t("settings") }} />
      <BackHeader title={t("settings")} />
      <ScrollView className="px-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {/* Profile */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">{t("profile")}</Text>

        {/* Avatar */}
        <View className="items-center mb-5">
          <Pressable className="active:opacity-80" onPress={pickImage}>
            {displayImage ? (
              <Image
                source={{ uri: displayImage }}
                className="w-24 h-24 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-24 h-24 rounded-full bg-primary/10 items-center justify-center">
                <Ionicons name="person-outline" size={40} color={primaryColor} />
              </View>
            )}
            <View className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary items-center justify-center border-2 border-background">
              <Ionicons name="camera-outline" size={14} color={bgColor} />
            </View>
          </Pressable>
        </View>

        {/* Name fields */}
        <View className="gap-3">
          <View className="gap-1">
            <Text className="text-primary/60 text-sm font-medium">{t("first_name")}</Text>
            <TextInput
              value={firstName}
              onChangeText={setFirstName}
              placeholder={t("first_name")}
              placeholderTextColor="#888"
              className="bg-card border border-primary/20 rounded-2xl px-4 py-3 text-primary text-base"
            />
          </View>
          <View className="gap-1">
            <Text className="text-primary/60 text-sm font-medium">{t("last_name")}</Text>
            <TextInput
              value={lastName}
              onChangeText={setLastName}
              placeholder={t("last_name")}
              placeholderTextColor="#888"
              className="bg-card border border-primary/20 rounded-2xl px-4 py-3 text-primary text-base"
            />
          </View>
        </View>

        {profileChanged && (
          <Pressable
            className={`active:opacity-70 mt-4 items-center justify-center rounded-2xl p-4 w-full ${saving ? "bg-primary/50" : "bg-primary"}`}
            onPress={saveProfile}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={bgColor} />
            ) : (
              <Text className="text-background font-bold text-base">{t("save")}</Text>
            )}
          </Pressable>
        )}
      </View>

      <View className="border-b border-muted" />

      {role === "patient" && (
        <>
          <PairingSection />
          <View className="border-b border-muted" />
          <View className="px-2 py-4">
            <Text className="text-primary font-semibold mb-2 text-xl">{t("simple_ui")}</Text>
            <Text className="text-primary/60 text-sm mb-4">{t("simple_ui_desc")}</Text>
            <View className="flex-row gap-4">
              <Pressable
                onPress={() => toggleSimpleUi(false)}
                className={`active:opacity-70 flex-1 items-center justify-center p-4 rounded-xl border ${
                  !simpleUi ? selectedCls : unselectedCls
                }`}
              >
                <Text className={!simpleUi ? "text-background font-bold" : "text-primary"}>
                  {t("off")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => toggleSimpleUi(true)}
                className={`active:opacity-70 flex-1 items-center justify-center p-4 rounded-xl border ${
                  simpleUi ? selectedCls : unselectedCls
                }`}
              >
                <Text className={simpleUi ? "text-background font-bold" : "text-primary"}>
                  {t("on")}
                </Text>
              </Pressable>
            </View>
          </View>
          <View className="border-b border-muted" />
        </>
      )}

      {role === "caretaker" && (
        <>
          <CaretakerLinkSection />
          <View className="border-b border-muted" />
        </>
      )}

      {/* Appearance */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">{t("appearance_heading")}</Text>
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => toggleTheme("light")}
            className={`active:opacity-70 flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "light" ? selectedCls : unselectedCls
            }`}
          >
            <Ionicons name="sunny-outline" size={20} color={colorScheme === "light" ? bgColor : primaryColor} />
            <Text className={colorScheme === "light" ? "text-background font-bold" : "text-primary"}>
              {t("light_mode")}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => toggleTheme("dark")}
            className={`active:opacity-70 flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              colorScheme === "dark" ? selectedCls : unselectedCls
            }`}
          >
            <Ionicons name="moon-outline" size={20} color={colorScheme === "dark" ? bgColor : primaryColor} />
            <Text className={colorScheme === "dark" ? "text-background font-bold" : "text-primary"}>
              {t("dark_mode")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="border-b border-muted" />

      {/* Language */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-4 text-xl">{t("language_heading")}</Text>
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => i18n.changeLanguage("en")}
            className={`active:opacity-70 flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              currentLanguage === "en" ? selectedCls : unselectedCls
            }`}
          >
            <Text className={currentLanguage === "en" ? "text-background font-bold" : "text-primary"}>
              🇬🇧 English
            </Text>
          </Pressable>

          <Pressable
            onPress={() => i18n.changeLanguage("th")}
            className={`active:opacity-70 flex-1 flex-row items-center justify-center gap-2 p-4 rounded-xl border ${
              currentLanguage === "th" ? selectedCls : unselectedCls
            }`}
          >
            <Text className={currentLanguage === "th" ? "text-background font-bold" : "text-primary"}>
              🇹🇭 ไทย
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="border-b border-muted" />

      {/* Notification Status */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-2 text-xl">{t("notifications_heading")}</Text>
        <View className="flex-row items-center justify-between bg-card border border-primary/20 rounded-2xl px-4 py-3 mb-3">
          <View className="flex-row items-center gap-2">
            <View
              className={`w-3 h-3 rounded-full ${
                notifPermission === "granted" ? "bg-green-500" : notifPermission === "denied" ? "bg-red-500" : "bg-primary/40"
              }`}
            />
            <Text className="text-primary text-base">
              {notifPermission === "granted"
                ? t("notifications_enabled")
                : notifPermission === "denied"
                  ? t("notifications_disabled")
                  : t("notifications_checking")}
            </Text>
          </View>
        </View>
        {notifPermission !== "granted" && (
          <Pressable
            onPress={() => Linking.openSettings()}
            className="active:opacity-70 items-center justify-center p-4 rounded-xl border border-primary"
          >
            <Text className="text-primary font-semibold">{t("open_settings")}</Text>
          </Pressable>
        )}
      </View>

      <View className="border-b border-muted" />

      {/* Notification Sound */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-2 text-xl">{t("notification_sound_heading")}</Text>
        <Text className="text-primary/60 text-sm mb-4">{t("notification_sound_desc")}</Text>
        <Pressable
          onPress={() => setShowSoundPicker(true)}
          className="active:opacity-70 flex-row items-center justify-between bg-card border border-primary/20 rounded-2xl px-4 py-3"
        >
          <Text className="text-primary text-base">{t("sound_n", { n: soundIndex + 1 })}</Text>
          <Ionicons name="chevron-down" size={20} color={primaryColor} />
        </Pressable>
      </View>

      <Modal
        visible={showSoundPicker}
        transparent
        animationType="fade"
        onRequestClose={closeSoundPicker}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-center items-center px-6"
          onPress={closeSoundPicker}
        >
          <Pressable className="bg-background rounded-3xl p-6 w-full gap-3" onPress={() => {}}>
            <Text className="text-xl font-bold text-primary mb-2">{t("notification_sound_heading")}</Text>
            {SOUND_FILES.map((_, i) => {
              const selected = soundIndex === i;
              return (
                <Pressable
                  key={i}
                  onPress={() => selectSound(i)}
                  className={`active:opacity-70 flex-row items-center justify-between rounded-2xl p-4 w-full border-2 ${
                    selected ? "bg-primary border-primary" : "bg-card border-muted"
                  }`}
                >
                  <Text className={`text-base font-bold ${selected ? "text-background" : "text-primary"}`}>
                    {t("sound_n", { n: i + 1 })}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={20} color={bgColor} />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>

      <View className="border-b border-muted" />

      {/* Pillbox — patient only; caretakers reach this via patient detail */}
      {role === "patient" && (
        <>
          <View className="px-2 py-4">
            <Text className="text-primary font-semibold mb-2 text-xl">{t("pillbox_setup_heading")}</Text>
            <Text className="text-primary/60 text-sm mb-4">{t("pillbox_setup_desc")}</Text>
            <Pressable
              onPress={() => router.push("/pillbox-setup")}
              className="active:opacity-70 flex-row items-center justify-between bg-card border border-primary/20 rounded-2xl px-4 py-3"
            >
              <View className="flex-row items-center gap-3">
                <Ionicons name="hardware-chip-outline" size={20} color={primaryColor} />
                <Text className="text-primary text-base font-medium">{t("pillbox_setup")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={primaryColor} />
            </Pressable>
          </View>

          <View className="border-b border-muted" />
        </>
      )}

      {/* Notification Debug Toggle */}
      <View className="px-2 py-4">
        <Text className="text-primary font-semibold mb-2 text-xl">{t("debug_notifications_toggle")}</Text>
        <Text className="text-primary/60 text-sm mb-4">{t("debug_notifications_toggle_desc")}</Text>
        <View className="flex-row gap-4">
          <Pressable
            onPress={() => toggleDebugNotifications(false)}
            className={`active:opacity-70 flex-1 items-center justify-center p-4 rounded-xl border ${
              !debugNotifications ? selectedCls : unselectedCls
            }`}
          >
            <Text className={!debugNotifications ? "text-background font-bold" : "text-primary"}>
              {t("off")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => toggleDebugNotifications(true)}
            className={`active:opacity-70 flex-1 items-center justify-center p-4 rounded-xl border ${
              debugNotifications ? selectedCls : unselectedCls
            }`}
          >
            <Text className={debugNotifications ? "text-background font-bold" : "text-primary"}>
              {t("on")}
            </Text>
          </Pressable>
        </View>
      </View>

      <View className="border-b border-muted" />

      {/* Sign Out */}
      <Pressable
        className="active:opacity-70 flex-row items-center justify-center gap-2 bg-red-500 rounded-2xl p-4 mt-6"
        onPress={async () => {
          if (user) {
            // 1. Drain the outbox so any pending edits/deletes reach the other
            //    side BEFORE this device's data may be wiped on next sign-in.
            try { await flushOutboxOnce(db, user.id); } catch (e) { console.warn("pre-signout flush failed", e); }
            // 2. Snapshot the (now-flushed) local state for fresh-install restore.
            try { await writeSnapshot(user.id, db); } catch (e) { console.warn("pre-signout snapshot failed", e); }
          }
          signOut({ redirectUrl: "/(auth)" });
        }}
      >
        <Ionicons name="log-out-outline" size={20} color="white" />
        <Text className="text-white font-bold text-base">{t("sign_out")}</Text>
      </Pressable>

      {/* Delete Account */}
      <Pressable
        className="active:opacity-70 flex-row items-center justify-center gap-2 border border-red-400 rounded-2xl p-4 mt-3 mb-10"
        onPress={() => setDeleteConfirmVisible(true)}
        disabled={deleting}
      >
        {deleting ? (
          <ActivityIndicator color="#ef4444" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
            <Text className="text-red-500 font-semibold text-base">{t("delete_account")}</Text>
          </>
        )}
      </Pressable>

      <ConfirmModal
        visible={isDeleteConfirmVisible}
        title={t("delete_account")}
        message={t("delete_account_confirm")}
        cancelText={t("cancel")}
        confirmText={t("delete_account")}
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={handleDeleteAccount}
      />
      </ScrollView>
    </View>
  );
}
