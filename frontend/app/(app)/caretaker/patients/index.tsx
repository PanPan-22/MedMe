import { useToast } from "@/context/toast-context";
import { readUserProfile, redeemPairingCode, removePatientLink } from "@/db/firestore-ops";
import { cancelNotificationsForMed } from "@/hooks/use-notifications";
import { Feather } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";

export interface Patient { id: number; name: string; image_uri?: string }

const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark:  { primary: "#86efac", background: "#0a1410" },
};

type Mode = "view" | "edit";

export default function PatientListScreen() {
  const db = useSQLiteContext();
  const { colorScheme } = useColorScheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const theme = THEME_COLORS[colorScheme ?? "light"];

  const { user } = useUser();

  const [text, setText] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [showActionModal, setShowActionModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useFocusEffect(useCallback(() => { fetchPatients(); }, []));

  const searchPatient = async (query: string) => {
    if (!query.trim()) { fetchPatients(); return; }
    const found = await db.getAllAsync<Patient>("SELECT * FROM patients WHERE name LIKE ?", [`%${query}%`]);
    setResults(found);
  };

  const fetchPatients = async () => {
    const rows = await db.getAllAsync<Patient>("SELECT * FROM patients");
    setResults(rows);
  };

  const exitEditMode = () => { setMode("view"); setSelectedIds(new Set()); };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setCode("");
    setErrors({});
  };

  const verifyCode = async () => {
    if (!user) return;
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setErrors({ code: t("invalid_code") });
      return;
    }
    setVerifying(true);
    try {
      const { patientClerkId } = await redeemPairingCode({ code: trimmed, caretakerClerkId: user.id });
      const profile = await readUserProfile(patientClerkId);
      if (!profile) throw new Error(t("invalid_code"));
      const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || t("patient_default_label");
      await db.runAsync(
        "INSERT INTO patients (name, image_uri, clerk_user_id, updated_at) VALUES (?, ?, ?, ?)",
        [fullName, profile.imageUrl ?? null, profile.clerkId, new Date().toISOString()],
      );
      showToast(t("linked_as", { name: fullName }));
      closeAddModal();
      fetchPatients();
    } catch (e: any) {
      const msg = e?.message ?? t("invalid_code");
      const friendly =
        msg.includes("expired") ? t("code_expired_msg")
        : msg.includes("used") ? t("code_already_used")
        : msg.includes("already") ? t("already_linked")
        : t("invalid_code");
      setErrors({ code: friendly });
    } finally {
      setVerifying(false);
    }
  };

  const deleteSelected = async () => {
    if (!canDelete) return;
    try {
      for (const id of selectedIds) {
        const row = await db.getFirstAsync<{ clerk_user_id: string | null }>(
          "SELECT clerk_user_id FROM patients WHERE id = ?", [id],
        );
        if (row?.clerk_user_id) {
          try { await removePatientLink(row.clerk_user_id); } catch { /* offline is ok */ }
        }
        const notifs = await db.getAllAsync<{ notification_id: string | null }>(
          "SELECT notification_id FROM schedules WHERE patient_id = ?", [id],
        );
        for (const n of notifs) {
          if (n.notification_id) {
            try { await cancelNotificationsForMed(n.notification_id); } catch { /* ignore */ }
          }
        }
        await db.runAsync("DELETE FROM schedules WHERE patient_id = ?", [id]);
        await db.runAsync("DELETE FROM medication_logs WHERE patient_id = ?", [id]);
        await db.runAsync("DELETE FROM patients WHERE id = ?", [id]);
      }
      showToast(t("patients_deleted"));
      setShowDeleteModal(false); setConfirmText(""); exitEditMode(); fetchPatients();
    } catch { showToast("Failed to delete", "error"); }
  };

  const canDelete = confirmText === "Confirm" || confirmText === "ยืนยัน";

  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: true, title: t("patients") }} />

      <View className="px-4 pt-4">
        <View className="flex-row items-center justify-between p-2 mb-4 w-full">
          <View className="flex-row items-center gap-4">
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={theme.primary} />
            </Pressable>
            <Text className="text-2xl font-bold text-primary">{t("patients")}</Text>
          </View>
          {mode === "view" ? (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => setShowActionModal(true)}>
              <Ionicons name="create-outline" size={32} color={theme.primary} />
            </Pressable>
          ) : (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={exitEditMode}>
              <Text className="text-primary font-semibold text-base">{t("done")}</Text>
            </Pressable>
          )}
        </View>
        <View className="flex-row items-center gap-2 px-3 w-full bg-card border border-muted rounded-full mb-4">
          <Feather name="search" size={24} color={theme.primary} />
          <TextInput
            value={text}
            onChangeText={(q) => { setText(q); searchPatient(q); }}
            placeholder={t("search_patients")}
            placeholderTextColor="#888888"
            className="px-1 py-2 flex-1 text-primary text-lg"
          />
        </View>
      </View>

      <FlatList
        style={{ flex: 1, paddingHorizontal: 16 }}
        extraData={{ mode, selectedIds }}
        data={results}
        keyExtractor={(item) => item.id.toString()}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={<Text className="text-center mt-10 text-primary/50">{t("no_patients")}</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              mode === "edit"
                ? toggleSelect(item.id)
                : router.push({ pathname: "/caretaker/patients/[id]", params: { id: item.id, patientName: item.name } })
            }
            className="active:opacity-70 p-2 border-b border-muted flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3 flex-1">
              {item.image_uri ? (
                <Image source={{ uri: item.image_uri }} className="w-12 h-12 rounded-full" resizeMode="cover" />
              ) : (
                <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
                  <Text className="text-primary font-bold text-lg">{item.name.charAt(0)}</Text>
                </View>
              )}
              <Text className="text-xl text-primary flex-1" numberOfLines={1}>{item.name}</Text>
            </View>
            {mode === "edit" && (
              <View className={`w-6 h-6 rounded border-2 items-center justify-center ${selectedIds.has(item.id) ? "bg-primary border-primary" : "border-primary/40"}`}>
                {selectedIds.has(item.id) && <Ionicons name="checkmark" size={14} color={theme.background} />}
              </View>
            )}
          </Pressable>
        )}
      />

      {mode === "edit" && (
        <View className="px-4 pt-2 pb-8 bg-background">
          <Pressable
            className={`items-center justify-center rounded-2xl p-4 w-full ${selectedIds.size > 0 ? "bg-red-500 active:opacity-70" : "bg-red-200"}`}
            onPress={() => { if (selectedIds.size > 0) setShowDeleteModal(true); }}
            disabled={selectedIds.size === 0}
          >
            <Text className="text-white font-bold text-lg">
              {t("delete")}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Text>
          </Pressable>
        </View>
      )}

      {/* Action Modal */}
      <Modal visible={showActionModal} transparent animationType="fade" onRequestClose={() => setShowActionModal(false)}>
        <Pressable className="flex-1 bg-black/60 justify-center items-center px-6" onPress={() => setShowActionModal(false)}>
          <Pressable className="bg-background rounded-3xl p-6 w-full gap-3" onPress={() => {}}>
            <Text className="text-xl font-bold text-primary mb-2">{t("patients")}</Text>
            <Pressable className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full" onPress={() => { setShowActionModal(false); setShowAddModal(true); }}>
              <Text className="text-background font-bold text-lg">{t("add_patient")}</Text>
            </Pressable>
            <Pressable className="active:opacity-70 items-center justify-center border-2 border-primary rounded-2xl p-4 w-full" onPress={() => { setShowActionModal(false); setMode("edit"); }}>
              <Text className="text-primary font-bold text-lg">{t("edit_patients")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Add Patient Modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={closeAddModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
          <Pressable className="flex-1 bg-black/60 justify-center items-center px-6" onPress={closeAddModal}>
            <Pressable className="bg-background rounded-3xl p-6 w-full" onPress={() => {}}>
              <View className="flex-row items-center justify-between mb-6">
                <Text className="text-2xl font-bold text-primary">{t("link_patient")}</Text>
                <Pressable hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} onPress={closeAddModal}>
                  <Ionicons name="close" size={24} color={theme.primary} />
                </Pressable>
              </View>

              <View className="gap-2 mb-6">
                <Text className="text-base font-semibold text-primary">{t("enter_code")}</Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => { setCode(v.replace(/\D/g, "").slice(0, 6)); setErrors({}); }}
                  placeholder="000000"
                  placeholderTextColor="#888888"
                  keyboardType="numeric"
                  maxLength={6}
                  className={`text-primary bg-card border rounded-2xl px-4 py-3 text-2xl tracking-widest text-center ${errors.code ? "border-red-500" : "border-primary"}`}
                />
                {errors.code ? <Text className="text-red-500 text-xs">{errors.code}</Text> : null}
              </View>
              <Pressable
                className={`active:opacity-70 items-center justify-center rounded-2xl p-4 w-full shadow-sm ${verifying ? "bg-primary/50" : "bg-primary"}`}
                onPress={verifyCode}
                disabled={verifying}
              >
                <Text className="text-background text-xl font-bold">{verifying ? "..." : t("verify")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => { setShowDeleteModal(false); setConfirmText(""); }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
          <Pressable className="flex-1 bg-black/60 justify-center items-center px-6" onPress={() => { setShowDeleteModal(false); setConfirmText(""); }}>
            <Pressable className="bg-background rounded-3xl p-6 w-full" onPress={() => {}}>
              <Text className="text-2xl font-bold text-primary mb-2">{t("delete_patient")}</Text>
              <Text className="text-primary/70 mb-6">{t("delete_type_confirm", { count: selectedIds.size })}</Text>
              <View className="gap-2 mb-6">
                <TextInput value={confirmText} onChangeText={setConfirmText} placeholder='Type "Confirm" / "ยืนยัน"' placeholderTextColor="#888888" className="text-primary bg-card border border-primary rounded-2xl px-4 py-3 text-base" />
              </View>
              <View className="flex-row gap-3">
                <Pressable className="active:opacity-70 flex-1 items-center justify-center border border-primary/40 rounded-2xl p-4" onPress={() => { setShowDeleteModal(false); setConfirmText(""); }}>
                  <Text className="text-primary font-semibold">{t("cancel")}</Text>
                </Pressable>
                <Pressable className={`flex-1 active:opacity-70 items-center justify-center rounded-2xl p-4 ${canDelete ? "bg-red-500" : "bg-red-200"}`} onPress={deleteSelected} disabled={!canDelete}>
                  <Text className="text-white font-bold">{t("delete")}</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
