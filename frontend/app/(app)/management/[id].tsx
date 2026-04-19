import { ConfirmModal } from "@/components/confirm-modal";
import { Medication } from "@/components/local-db";
import { useToast } from "@/context/toast-context";
import { deleteScheduleAndSync, updateScheduleAndSync } from "@/db/sync-helpers";
import { useBrandColor } from "@/hooks/use-brand-color";
import { cancelNotificationsForMed, scheduleNotificationsForMed } from "@/hooks/use-notifications";
import { toLocalISODate } from "@/lib/date";
import { uploadMedImage } from "@/lib/upload";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { SheetManager } from "react-native-actions-sheet";

const MEDICATION_TYPES = ["Pills", "Capsule", "Injection", "Other"];
const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DAY_KEYS: Record<string, string> = {
  Mon: "day_mon", Tue: "day_tue", Wed: "day_wed", Thu: "day_thu",
  Fri: "day_fri", Sat: "day_sat", Sun: "day_sun",
};

const formatDate = (d: Date) =>
  `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()}`;

const TYPE_KEYS: Record<string, string> = {
  Pills: "type_pills", Capsule: "type_capsule", Injection: "type_injection", Other: "type_other",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="bg-card rounded-2xl border border-primary/20 mb-4 overflow-hidden">
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center px-4 py-3">
      <Text className="text-sm font-semibold text-primary/50 w-24">{label}</Text>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams();
  const db = useSQLiteContext();
  const { user } = useUser();
  const role = (user?.unsafeMetadata as any)?.role as "patient" | "caretaker" | undefined;
  const { colors } = useTheme();
  const { primary: brandColor } = useBrandColor();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const [med, setMed] = useState<Medication | null>(null);
  const [editing, setEditing] = useState(false);

  const [name, setName] = useState("");
  const [medType, setMedType] = useState("Pills");
  const [amount, setAmount] = useState("");
  const [stock, setStock] = useState("");
  const [note, setNote] = useState("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [times, setTimes] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(DAYS_OF_WEEK);
  const [startDate, setStartDate] = useState(new Date());
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [isTimePickerVisible, setTimePickerVisible] = useState(false);
  const [editingTimeIndex, setEditingTimeIndex] = useState<number | null>(null);
  const [isStartPickerVisible, setStartPickerVisible] = useState(false);
  const [isExpiryPickerVisible, setExpiryPickerVisible] = useState(false);
  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const calcEndDate = (start: Date, stockVal: string, amountVal: string, timesCount: number): Date => {
    const s = parseInt(stockVal) || 0;
    const a = parseInt(amountVal) || 1;
    const days = timesCount > 0 ? Math.floor(s / (a * timesCount)) : 0;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return end;
  };
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { fetchMedication(); }, []);

  const fetchMedication = async () => {
    try {
      const result = await db.getFirstAsync<Medication>(
        "SELECT * FROM schedules WHERE id = ?", [id.toString()],
      );
      if (result) { setMed(result); populateFields(result); }
    } catch (e) { console.error(e); }
  };

  const populateFields = (m: Medication) => {
    setName(m.medicine_name);
    setMedType(m.type || "Pills");
    setAmount(m.count?.toString() ?? "");
    setStock(m.stock?.toString() ?? "");
    setNote(m.additional ?? "");
    setImageUri(m.image_uri || null);
    setTimes(m.whenToTake ? m.whenToTake.split(",").filter(Boolean) : []);
    setSelectedDays(m.repeat_days ? m.repeat_days.split(",").filter(Boolean) : DAYS_OF_WEEK);
    setStartDate(m.start_date ? new Date(m.start_date) : new Date());
    setExpirationDate(m.expiration_date ? new Date(m.expiration_date) : null);
  };

  const cancelEdit = () => {
    if (med) populateFields(med);
    setEditing(false);
    setErrors({});
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = t("error_required");
    if (!amount.trim() || parseInt(amount) <= 0) e.amount = t("error_invalid_amount");
    if (!stock.trim() || parseInt(stock) <= 0) e.stock = t("error_invalid_stock");
    if (selectedDays.length === 0) e.days = t("error_select_day");
    if (times.length === 0) e.times = t("error_add_time");
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    if (!user || !role) { showToast(t("not_signed_in"), "error"); return; }
    try {
      console.log(`[edit] cancelling old notifs: "${med?.notification_id}"`);
      await cancelNotificationsForMed(med?.notification_id ?? "");
      const notifIds = await scheduleNotificationsForMed({
        medicineName: name.trim(),
        whenToTake: times.join(","),
        repeatDays: selectedDays.join(","),
        stock: parseInt(stock) || 0,
        count: parseInt(amount) || 1,
        startDate: toLocalISODate(startDate),
        patientId: med?.patient_id,
      });
      console.log(`[edit] scheduled new notifs: "${notifIds}" (count=${notifIds.split(",").filter(Boolean).length})`);
      let uploadedUri = "";
      if (imageUri) {
        if (imageUri.startsWith("http://") || imageUri.startsWith("https://")) {
          uploadedUri = imageUri;
        } else {
          try { uploadedUri = await uploadMedImage(imageUri, user.id); }
          catch (e) { console.warn("image upload failed, saving without:", e); }
        }
      }
      await updateScheduleAndSync(db, user.id, role, Number(id), {
        medicine_name: name.trim(),
        type: medType,
        count: parseInt(amount) || 0,
        whenToTake: times.join(","),
        additional: note.trim(),
        stock: parseInt(stock) || 0,
        expiration_date: expirationDate ? toLocalISODate(expirationDate) : "",
        image_uri: uploadedUri,
        repeat_days: selectedDays.join(","),
        start_date: toLocalISODate(startDate),
        end_date: toLocalISODate(calcEndDate(startDate, stock, amount, times.length)),
        notification_id: notifIds,
      });
      showToast(t("medication_updated"));
      setEditing(false);
      fetchMedication();
    } catch { showToast(t("medication_update_failed"), "error"); }
  };

  const deleteMed = () => setDeleteConfirmVisible(true);

  const confirmDeleteMed = async () => {
    if (!user || !role) return;
    setDeleteConfirmVisible(false);
    await cancelNotificationsForMed(med?.notification_id ?? "");
    await deleteScheduleAndSync(db, user.id, role, Number(id));
    showToast(t("medication_deleted"));
    router.back();
  };

  const handleTimeConfirm = (date: Date) => {
    const h = date.getHours().toString().padStart(2, "0");
    const m = date.getMinutes().toString().padStart(2, "0");
    const newTime = `${h}:${m}`;
    if (editingTimeIndex !== null) {
      const updated = times.map((t, i) => (i === editingTimeIndex ? newTime : t));
      setTimes([...new Set(updated)].sort());
    } else if (!times.includes(newTime)) {
      setTimes([...times, newTime].sort());
    }
    setErrors((e) => ({ ...e, times: "" }));
    setEditingTimeIndex(null);
    setTimePickerVisible(false);
  };

  const pickerDate = editingTimeIndex !== null
    ? (() => { const [h, m] = times[editingTimeIndex].split(":"); const d = new Date(); d.setHours(+h, +m, 0); return d; })()
    : new Date();

  const handleImagePicker = async () => {
    const result = (await SheetManager.show("image-picker-sheet")) as { uri: string } | undefined;
    if (result?.uri) setImageUri(result.uri);
  };

  if (!med) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <Text className="text-primary/50">Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="bg-background flex-1">
      <Stack.Screen options={{ headerShown: true, title: t("detail") }} />

      <View className="px-4 pt-4 pb-12">
        {/* Header */}
        <View className="flex-row items-center justify-between p-2 mb-4 w-full">
          <View className="flex-row items-center gap-4 flex-1 mr-4">
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
            </Pressable>
            <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>
              {med.medicine_name}
            </Text>
          </View>

          {editing ? (
            <View className="flex-row gap-3 items-center">
              <Pressable hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} onPress={cancelEdit}>
                <Text className="text-primary/60 font-semibold">{t("cancel")}</Text>
              </Pressable>
              <Pressable className="active:opacity-70 bg-primary px-4 py-2 rounded-xl" onPress={save}>
                <Text className="text-background font-bold text-sm">{t("save")}</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }} onPress={() => setEditing(true)}>
              <Ionicons name="create-outline" size={28} color={colors.text} />
            </Pressable>
          )}
        </View>

        {/* Image */}
        {editing ? (
          <View className="gap-2 mb-4">
            <Text className="text-base font-semibold text-primary px-2">{t("medicine_image")}</Text>
            <Pressable
              onPress={handleImagePicker}
              className="border-2 border-dashed border-primary rounded-2xl overflow-hidden bg-card items-center justify-center"
              style={{ aspectRatio: 4 / 3 }}
            >
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={{ width: "100%", height: "100%" }}
                  resizeMode="contain"
                />
              ) : (
                <View className="items-center gap-2">
                  <Ionicons name="camera-outline" size={40} color={brandColor} />
                  <Text className="text-primary text-sm">{t("tap_to_add_photo")}</Text>
                </View>
              )}
            </Pressable>
            {imageUri && (
              <Pressable onPress={() => setImageUri(null)} className="active:opacity-70 self-end bg-red-500 px-4 py-2 rounded-xl">
                <Text className="text-white font-semibold text-sm">{t("clear")}</Text>
              </Pressable>
            )}
          </View>
        ) : imageUri ? (
          <View className="rounded-2xl overflow-hidden bg-card mb-4 border border-primary/20 items-center justify-center" style={{ aspectRatio: 4 / 3 }}>
            <Image
              source={{ uri: imageUri }}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {editing ? (
          <>
            {/* Name */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("medication_name")}</Text>
              <TextInput
                value={name}
                onChangeText={(v) => { setName(v); setErrors((e) => ({ ...e, name: "" })); }}
                placeholder={t("placeholder_medicine")}
                placeholderTextColor="#888888"
                className={`text-primary bg-card border rounded-2xl px-4 py-3 text-base ${errors.name ? "border-red-500" : "border-primary"}`}
              />
              {errors.name ? <Text className="text-red-500 text-xs">{errors.name}</Text> : null}
            </View>

            {/* Type */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("type")}</Text>
              <View className="flex-row gap-2 flex-wrap">
                {MEDICATION_TYPES.map((mType) => (
                  <Pressable
                    key={mType}
                    onPress={() => setMedType(mType)}
                    className={`px-4 py-2 rounded-full border ${medType === mType ? "bg-primary border-primary" : "bg-card border-muted"}`}
                  >
                    <Text className={medType === mType ? "text-background font-semibold" : "text-primary/60"}>
                      {t(TYPE_KEYS[mType])}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Amount + Stock */}
            <View className="flex-row gap-4 px-2 mb-4">
              <View className="flex-1 gap-2">
                <Text className="text-base font-semibold text-primary">{t("amount")}</Text>
                <TextInput
                  value={amount}
                  onChangeText={(v) => { setAmount(v); setErrors((e) => ({ ...e, amount: "" })); }}
                  keyboardType="numeric"
                  placeholder={t("placeholder_amount")}
                  placeholderTextColor="#888888"
                  className={`text-primary bg-card border rounded-2xl px-4 py-3 text-base ${errors.amount ? "border-red-500" : "border-primary"}`}
                />
                {errors.amount ? <Text className="text-red-500 text-xs">{errors.amount}</Text> : null}
              </View>
              <View className="flex-1 gap-2">
                <Text className="text-base font-semibold text-primary">{t("stock")}</Text>
                <TextInput
                  value={stock}
                  onChangeText={(v) => { setStock(v); setErrors((e) => ({ ...e, stock: "" })); }}
                  keyboardType="numeric"
                  placeholder={t("placeholder_stock")}
                  placeholderTextColor="#888888"
                  className={`text-primary bg-card border rounded-2xl px-4 py-3 text-base ${errors.stock ? "border-red-500" : "border-primary"}`}
                />
                {errors.stock ? <Text className="text-red-500 text-xs">{errors.stock}</Text> : null}
              </View>
            </View>

            {/* Schedule */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("schedule")}</Text>
              <View className="flex-row flex-wrap gap-2 items-center">
                {times.map((time, index) => (
                  <Pressable key={time} onPress={() => { setEditingTimeIndex(index); setTimePickerVisible(true); }} className="flex-row items-center bg-primary/10 border border-primary rounded-full px-3 py-1.5">
                    <Text className="text-primary font-bold mr-2">{time}</Text>
                    <Pressable onPress={(e) => { e.stopPropagation(); setTimes(times.filter((_, i) => i !== index)); }}>
                      <Ionicons name="close-circle" size={18} color="#ef4444" />
                    </Pressable>
                  </Pressable>
                ))}
                <Pressable
                  className="flex-row items-center bg-card border border-dashed border-primary rounded-full px-3 py-1.5"
                  onPress={() => { setEditingTimeIndex(null); setTimePickerVisible(true); }}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text className="text-primary font-medium ml-1 text-sm">{t("add_time")}</Text>
                </Pressable>
              </View>
              {errors.times ? <Text className="text-red-500 text-xs">{errors.times}</Text> : null}
            </View>

            {/* Repeat On */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("repeat_on")}</Text>
              <View className="flex-row justify-between">
                {DAYS_OF_WEEK.map((day) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <Pressable
                      key={day}
                      onPress={() => {
                        const next = isSelected ? selectedDays.filter((d) => d !== day) : [...selectedDays, day];
                        setSelectedDays(next);
                        if (next.length > 0) setErrors((e) => ({ ...e, days: "" }));
                      }}
                      className={`w-10 h-10 rounded-full items-center justify-center ${isSelected ? "bg-primary border-2 border-primary" : "bg-card border border-muted"}`}
                    >
                      <Text className={`text-xs font-bold ${isSelected ? "text-background" : "text-primary/60"}`}>
                        {t(DAY_KEYS[day])}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {errors.days ? <Text className="text-red-500 text-xs">{errors.days}</Text> : null}
            </View>

            {/* Dates */}
            <View className="flex-row gap-3 px-2 mb-4">
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("start_date")}</Text>
                <Pressable onPress={() => setStartPickerVisible(true)} className="bg-card border border-primary rounded-xl py-3 px-3">
                  <Text className="text-primary text-xs text-center">{formatDate(startDate)}</Text>
                </Pressable>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("end_date")}</Text>
                <View className="bg-primary/5 border border-primary/40 rounded-xl py-3 px-3">
                  <Text className="text-primary/60 text-xs text-center">{formatDate(calcEndDate(startDate, stock, amount, times.length))}</Text>
                </View>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-sm font-semibold text-primary">{t("expiry_date")}</Text>
                <Pressable onPress={() => setExpiryPickerVisible(true)} className="bg-card border border-primary rounded-xl py-3 px-3">
                  <Text className="text-primary text-xs text-center">{expirationDate ? formatDate(expirationDate) : "—"}</Text>
                </Pressable>
              </View>
            </View>

            {/* Notes */}
            <View className="gap-2 px-2 mb-4">
              <Text className="text-base font-semibold text-primary">{t("additional_notes")}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder={t("placeholder_notes")}
                placeholderTextColor="#888888"
                textAlignVertical="top"
                className="text-primary text-base h-28 bg-card border border-primary rounded-2xl p-4"
              />
            </View>
          </>
        ) : (
          <>
            {/* Info card */}
            <Card>
              <Row label={t("medication_name")}>
                <Text className="text-base text-primary font-medium">{med.medicine_name}</Text>
              </Row>
              <Row label={t("type")}>
                <View className="bg-primary self-start px-3 py-1 rounded-full">
                  <Text className="text-background text-sm font-semibold">{t(TYPE_KEYS[med.type] ?? "type_other")}</Text>
                </View>
              </Row>
              <Row label={t("amount")}>
                <Text className="text-base text-primary">{med.count ?? "—"}</Text>
              </Row>
              <Row label={t("stock")}>
                <Text className="text-base text-primary">{med.stock ?? "—"}</Text>
              </Row>
            </Card>

            {/* Schedule card */}
            <Card>
              <Row label={t("repeat_on")}>
                <View className="flex-row flex-wrap gap-1">
                  {DAYS_OF_WEEK.map((day) => {
                    const active = selectedDays.includes(day);
                    return (
                      <View key={day} className={`w-8 h-8 rounded-full items-center justify-center ${active ? "bg-primary" : "bg-primary/10"}`}>
                        <Text className={`text-xs font-bold ${active ? "text-background" : "text-primary/40"}`}>
                          {t(DAY_KEYS[day])}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Row>
              <Row label={t("schedule")}>
                <View className="flex-row flex-wrap gap-2">
                  {times.length > 0 ? times.map((time) => (
                    <View key={time} className="bg-primary/10 border border-primary rounded-full px-3 py-1">
                      <Text className="text-primary font-bold text-sm">{time}</Text>
                    </View>
                  )) : <Text className="text-primary/50">—</Text>}
                </View>
              </Row>
            </Card>

            {/* Dates card */}
            <Card>
              <Row label={t("start_date")}>
                <Text className="text-base text-primary">{formatDate(startDate)}</Text>
              </Row>
              <Row label={t("end_date")}>
                <Text className="text-base text-primary">{med.end_date ? formatDate(new Date(med.end_date)) : "—"}</Text>
              </Row>
              <Row label={t("expiry_date")}>
                <Text className="text-base text-primary">{expirationDate ? formatDate(expirationDate) : "—"}</Text>
              </Row>
            </Card>

            {/* Notes card */}
            {med.additional ? (
              <Card>
                <Row label={t("additional_notes")}>
                  <Text className="text-base text-primary">{med.additional}</Text>
                </Row>
              </Card>
            ) : null}

            <Pressable
              className="active:opacity-70 items-center justify-center bg-red-500 rounded-2xl p-4 w-full mt-2"
              onPress={deleteMed}
            >
              <Text className="text-white font-bold text-base">{t("delete")}</Text>
            </Pressable>
          </>
        )}
      </View>

      <DateTimePickerModal isVisible={isTimePickerVisible} mode="time" date={pickerDate} onConfirm={handleTimeConfirm} onCancel={() => { setEditingTimeIndex(null); setTimePickerVisible(false); }} />
      <DateTimePickerModal isVisible={isStartPickerVisible} mode="date" onConfirm={(d) => { setStartDate(d); setStartPickerVisible(false); }} onCancel={() => setStartPickerVisible(false)} />
      <DateTimePickerModal isVisible={isExpiryPickerVisible} mode="date" onConfirm={(d) => { setExpirationDate(d); setExpiryPickerVisible(false); }} onCancel={() => setExpiryPickerVisible(false)} />
      <ConfirmModal
        visible={isDeleteConfirmVisible}
        title={t("delete")}
        message={t("delete_confirm_med") ?? "Delete this medication?"}
        cancelText={t("cancel")}
        confirmText={t("delete")}
        destructive
        onCancel={() => setDeleteConfirmVisible(false)}
        onConfirm={confirmDeleteMed}
      />
    </ScrollView>
  );
}
