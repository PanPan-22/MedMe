import { useToast } from "@/context/toast-context";
import { Feather } from "@expo/vector-icons";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useFocusEffect } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useColorScheme } from "nativewind";

export interface Patient {
  id: number;
  name: string;
  age: number;
}

const THEME_COLORS = {
  light: { primary: "#062d13", background: "#f2fbf5" },
  dark:  { primary: "#ffffff", background: "#000000" },
};

type Mode = "view" | "edit";

export default function PatientListScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { colorScheme } = useColorScheme();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const theme = THEME_COLORS[colorScheme ?? "light"];

  const [text, setText] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [mode, setMode] = useState<Mode>("view");
  const [showActionModal, setShowActionModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Add form state
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      fetchPatients();
    }, []),
  );

  const searchPatient = async (query: string) => {
    if (!query.trim()) { fetchPatients(); return; }
    try {
      const found = await db.getAllAsync<Patient>(
        "SELECT * FROM patients WHERE name LIKE ?",
        [`%${query}%`],
      );
      setResults(found);
    } catch (e) {
      console.error("Search error:", e);
    }
  };

  const fetchPatients = async () => {
    try {
      const rows = await db.getAllAsync<Patient>("SELECT * FROM patients");
      setResults(rows);
    } catch (e) {
      console.error(e);
    }
  };

  const exitEditMode = () => {
    setMode("view");
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setName("");
    setAge("");
    setErrors({});
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Required";
    if (!age.trim() || parseInt(age) <= 0) e.age = "Enter a valid age";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const addPatient = async () => {
    if (!validate()) return;
    try {
      await db.runAsync("INSERT INTO patients (name, age) VALUES (?, ?)", [name.trim(), parseInt(age)]);
      showToast(`Welcome, ${name}!`);
      closeAddModal();
      fetchPatients();
    } catch {
      showToast("Failed to add patient", "error");
    }
  };

  const deleteSelected = async () => {
    if (!canDelete) return;
    try {
      for (const id of selectedIds) {
        await db.runAsync("DELETE FROM patients WHERE id = ?", [id]);
      }
      showToast(t("patients_deleted"));
      setShowDeleteModal(false);
      setConfirmText("");
      exitEditMode();
      fetchPatients();
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const canDelete = confirmText === "Confirm" || confirmText === "ยืนยัน";

  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: true, title: "Patients" }} />

      {/* Fixed header + search */}
      <View className="px-4 pt-4">
        <View className="flex-row items-center justify-between p-2 mb-4 w-full">
          <View className="flex-row items-center gap-4">
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
            </Pressable>
            <Text className="text-2xl font-bold text-primary">{t("patients")}</Text>
          </View>
          {mode === "view" ? (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => setShowActionModal(true)}>
              <Ionicons name="create-outline" size={32} color={colors.text} />
            </Pressable>
          ) : (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={exitEditMode}>
              <Text className="text-primary font-semibold text-base">{t("done")}</Text>
            </Pressable>
          )}
        </View>

        <View className="flex-row items-center gap-2 px-3 w-full bg-white border border-gray-300 rounded-full mb-4">
          <Feather name="search" size={24} color="black" />
          <TextInput
            value={text}
            onChangeText={(q) => { setText(q); searchPatient(q); }}
            placeholder={t("search_patients")}
            placeholderTextColor="#888888"
            className="px-1 py-2 flex-1 text-primary text-lg"
          />
        </View>
      </View>

      {/* List — flex-1 directly inside root, not inside another flex-1 wrapper */}
      <FlatList
        style={{ flex: 1, paddingHorizontal: 16 }}
        extraData={{ mode, selectedIds }}
        data={results}
        keyExtractor={(item) => item.id.toString()}
        ListEmptyComponent={
          <Text className="text-center mt-10 text-primary/50">{t("no_patients")}</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              mode === "edit"
                ? toggleSelect(item.id)
                : router.push({ pathname: "/patients/edit/[id]", params: { id: item.id, name: item.name, age: item.age.toString() } })
            }
            className="active:opacity-70 p-2 border-b border-gray-200 flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <Ionicons name="person-circle-outline" size={50} color={colors.text} />
              <Text className="text-xl text-primary flex-1" numberOfLines={1}>{item.name}</Text>
            </View>
            {mode === "edit" && (
              <View className={`w-6 h-6 rounded border-2 items-center justify-center ${selectedIds.has(item.id) ? "bg-primary border-primary" : "border-primary/40"}`}>
                {selectedIds.has(item.id) && (
                  <Ionicons name="checkmark" size={14} color={theme.background} />
                )}
              </View>
            )}
          </Pressable>
        )}
      />

      {/* Delete bar — natural-height sibling below the flex-1 list */}
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

      {/* Action Modal — Add or Edit */}
      <Modal visible={showActionModal} transparent animationType="fade" onRequestClose={() => setShowActionModal(false)}>
        <Pressable className="flex-1 bg-black/60 justify-center items-center px-6" onPress={() => setShowActionModal(false)}>
          <Pressable className="bg-background rounded-3xl p-6 w-full gap-3" onPress={() => {}}>
            <Text className="text-xl font-bold text-primary mb-2">{t("patients")}</Text>
            <Pressable
              className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full"
              onPress={() => { setShowActionModal(false); setShowAddModal(true); }}
            >
              <Text className="text-background font-bold text-lg">{t("add_patient")}</Text>
            </Pressable>
            <Pressable
              className="active:opacity-70 items-center justify-center border-2 border-primary rounded-2xl p-4 w-full"
              onPress={() => { setShowActionModal(false); setMode("edit"); }}
            >
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
                <Text className="text-2xl font-bold text-primary">{t("add_patient")}</Text>
                <Pressable hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} onPress={closeAddModal}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>

              <View className="gap-2 mb-4">
                <Text className="text-base font-semibold text-primary">{t("patient_name")}</Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: "" })); }}
                  placeholder="eg. John Doe"
                  placeholderTextColor="#888888"
                  className={`text-primary bg-white border rounded-2xl px-4 py-3 text-base ${errors.name ? "border-red-500" : "border-primary"}`}
                />
                {errors.name ? <Text className="text-red-500 text-xs">{errors.name}</Text> : null}
              </View>

              <View className="gap-2 mb-6">
                <Text className="text-base font-semibold text-primary">{t("age")}</Text>
                <TextInput
                  value={age}
                  onChangeText={(v) => { setAge(v); setErrors((e) => ({ ...e, age: "" })); }}
                  placeholder="eg. 65"
                  placeholderTextColor="#888888"
                  keyboardType="numeric"
                  className={`text-primary bg-white border rounded-2xl px-4 py-3 text-base ${errors.age ? "border-red-500" : "border-primary"}`}
                />
                {errors.age ? <Text className="text-red-500 text-xs">{errors.age}</Text> : null}
              </View>

              <Pressable
                className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full shadow-sm"
                onPress={addPatient}
              >
                <Text className="text-background text-xl font-bold">{t("save")}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => { setShowDeleteModal(false); setConfirmText(""); }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
          <Pressable
            className="flex-1 bg-black/60 justify-center items-center px-6"
            onPress={() => { setShowDeleteModal(false); setConfirmText(""); }}
          >
            <Pressable className="bg-background rounded-3xl p-6 w-full" onPress={() => {}}>
              <Text className="text-2xl font-bold text-primary mb-2">{t("delete_patient")}</Text>
              <Text className="text-primary/70 mb-6">
                {t("delete_type_confirm", { count: selectedIds.size })}
              </Text>

              <View className="gap-2 mb-6">
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder='Type "Confirm" / "ยืนยัน"'
                  placeholderTextColor="#888888"
                  className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
                />
              </View>

              <View className="flex-row gap-3">
                <Pressable
                  className="active:opacity-70 flex-1 items-center justify-center border border-primary/30 rounded-2xl p-4"
                  onPress={() => { setShowDeleteModal(false); setConfirmText(""); }}
                >
                  <Text className="text-primary font-semibold">{t("cancel")}</Text>
                </Pressable>
                <Pressable
                  className={`flex-1 active:opacity-70 items-center justify-center rounded-2xl p-4 ${canDelete ? "bg-red-500" : "bg-red-200"}`}
                  onPress={deleteSelected}
                  disabled={!canDelete}
                >
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
