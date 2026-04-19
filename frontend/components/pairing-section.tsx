import { ConfirmModal } from "@/components/confirm-modal";
import { useToast } from "@/context/toast-context";
import { createPairingCode, deletePairingCode, readUserProfile, redeemPairingCode, removePatientLink } from "@/db/firestore-ops";
import { getLink } from "@/db/sync-db";
import { PatientLink } from "@/db/sync-types";
import { useBrandColor } from "@/hooks/use-brand-color";
import { useUser } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function PairingSection() {
  const { user } = useUser();
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { background } = useBrandColor();

  const [link, setLink] = useState<PatientLink | null>(null);
  const [caretakerName, setCaretakerName] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [isUnlinkConfirmVisible, setUnlinkConfirmVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;
    getLink(db, user.id).then(setLink);
    const id = setInterval(() => {
      getLink(db, user.id).then(setLink);
    }, 2000);
    return () => clearInterval(id);
  }, [user, db]);

  useEffect(() => {
    if (!link) { setCaretakerName(null); return; }
    readUserProfile(link.caretaker_clerk_id).then((p) => {
      if (!p) { setCaretakerName(null); return; }
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
      setCaretakerName(name || null);
    }).catch(() => setCaretakerName(null));
  }, [link?.caretaker_clerk_id]);

  useEffect(() => {
    if (!expiresAt) {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
      return;
    }
    const tick = () => {
      const ms = expiresAt.getTime() - Date.now();
      setRemaining(ms);
      if (ms <= 0) {
        setCode(null);
        setExpiresAt(null);
      }
    };
    tick();
    tickRef.current = setInterval(tick, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [expiresAt]);

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const result = await createPairingCode(user.id);
      setCode(result.code);
      setExpiresAt(result.expiresAt);
    } catch (e: any) {
      showToast(e?.message ?? t("profile_save_error"), "error");
    } finally {
      setGenerating(false);
    }
  };

  const cancelCode = async () => {
    if (!code) return;
    try { await deletePairingCode(code); } catch { /* ignore */ }
    setCode(null);
    setExpiresAt(null);
  };

  const unlink = () => setUnlinkConfirmVisible(true);

  const confirmUnlink = async () => {
    if (!user) return;
    setUnlinkConfirmVisible(false);
    try {
      await removePatientLink(user.id);
    } catch (e: any) {
      showToast(e?.message ?? t("profile_save_error"), "error");
    }
  };

  return (
    <View className="px-2 py-4">
      <Text className="text-primary font-semibold mb-4 text-xl">{t("caretaker_link")}</Text>

      {link ? (
        <View className="gap-3">
          <View className="bg-primary/10 rounded-xl px-4 py-3">
            <Text className="text-primary/50 text-xs">{t("linked_to_caretaker")}</Text>
            <Text className="text-primary font-semibold text-base" numberOfLines={1}>
              {caretakerName ?? t("caretaker_default_label")}
            </Text>
          </View>
          <Pressable
            className="active:opacity-70 flex-row items-center justify-center gap-2 border border-red-400 rounded-2xl p-3"
            onPress={unlink}
          >
            <Ionicons name="unlink-outline" size={18} color="#ef4444" />
            <Text className="text-red-500 font-semibold">{t("unlink")}</Text>
          </Pressable>
        </View>
      ) : code && expiresAt ? (
        <View className="gap-3">
          <View className="bg-primary rounded-2xl p-5 items-center">
            <Text className="text-background/70 text-xs mb-1">{t("pairing_code_label")}</Text>
            <Text className="text-background text-5xl font-bold tracking-widest" maxFontSizeMultiplier={1.2}>
              {code}
            </Text>
            <Text className="text-background/70 text-xs mt-2">
              {t("code_expires_in", { time: formatRemaining(remaining) })}
            </Text>
          </View>
          <Text className="text-primary/60 text-xs text-center">{t("pairing_instructions")}</Text>
          <Pressable
            className="active:opacity-70 items-center justify-center border border-primary/40 rounded-2xl p-3"
            onPress={cancelCode}
          >
            <Text className="text-primary font-semibold">{t("cancel")}</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-primary/60 text-sm">{t("no_caretaker_linked")}</Text>
          <Pressable
            className={`active:opacity-70 flex-row items-center justify-center gap-2 rounded-2xl p-3 ${generating ? "bg-primary/50" : "bg-primary"}`}
            onPress={generate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color={background} />
            ) : (
              <>
                <Ionicons name="link-outline" size={18} color={background} />
                <Text className="text-background font-semibold">{t("generate_code")}</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
      <ConfirmModal
        visible={isUnlinkConfirmVisible}
        title={t("unlink")}
        message={t("confirm_unlink")}
        cancelText={t("cancel")}
        confirmText={t("unlink")}
        destructive
        onCancel={() => setUnlinkConfirmVisible(false)}
        onConfirm={confirmUnlink}
      />
    </View>
  );
}

export function CaretakerLinkSection() {
  const { user } = useUser();
  const db = useSQLiteContext();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { background } = useBrandColor();

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = async () => {
    if (!user) return;
    const trimmed = code.trim();
    if (trimmed.length !== 6) {
      setError(t("invalid_code"));
      return;
    }
    setVerifying(true);
    setError(null);
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
      setCode("");
    } catch (e: any) {
      const msg = e?.message ?? t("invalid_code");
      const friendly =
        msg.includes("expired") ? t("code_expired_msg")
        : msg.includes("used") ? t("code_already_used")
        : msg.includes("already") ? t("already_linked")
        : t("invalid_code");
      setError(friendly);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View className="px-2 py-4">
      <Text className="text-primary font-semibold mb-4 text-xl">{t("link_patient")}</Text>
      <View className="gap-2 mb-3">
        <TextInput
          value={code}
          onChangeText={(v) => { setCode(v.replace(/\D/g, "").slice(0, 6)); setError(null); }}
          placeholder="000000"
          placeholderTextColor="#888"
          keyboardType="numeric"
          maxLength={6}
          className={`text-primary bg-card border rounded-2xl px-4 py-3 text-2xl tracking-widest text-center ${error ? "border-red-500" : "border-primary"}`}
        />
        {error ? <Text className="text-red-500 text-xs">{error}</Text> : null}
      </View>
      <Pressable
        className={`active:opacity-70 flex-row items-center justify-center gap-2 rounded-2xl p-3 ${verifying ? "bg-primary/50" : "bg-primary"}`}
        onPress={link}
        disabled={verifying}
      >
        {verifying ? (
          <ActivityIndicator color={background} />
        ) : (
          <>
            <Ionicons name="link-outline" size={18} color={background} />
            <Text className="text-background font-semibold">{t("verify")}</Text>
          </>
        )}
      </Pressable>
    </View>
  );
}
