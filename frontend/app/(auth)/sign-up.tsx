import LanguageToggle from "@/components/language-toggle";
import { useClerk, useSignUp } from "@clerk/expo";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@react-navigation/native";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSQLiteContext } from "expo-sqlite";

type Role = "caretaker" | "patient";

const ROLES: { value: Role; key: string; icon: string }[] = [
  { value: "caretaker", key: "role_caretaker", icon: "medkit-outline" },
  { value: "patient", key: "role_patient", icon: "person-outline" },
];

export default function SignUpScreen() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const { setActive } = useClerk();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const db = useSQLiteContext();

  const [role, setRole] = useState<Role>("caretaker");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const loading = fetchStatus === "fetching";
  const visibleErrors = showErrors ? errors : undefined;
  const raw = (visibleErrors as any)?.raw ?? [];
  const usernameError = raw.find((e: any) => e.meta?.paramName === "username" || e.meta?.paramName === "identifier");
  const passwordError = raw.find((e: any) => e.meta?.paramName === "password");
  const globalError = raw.find((e: any) => !e.meta?.paramName);

  const handleSignUp = async () => {
    setShowErrors(true);
    try {
      await signUp.create({
        username: username.trim(),
        password,
        unsafeMetadata: { role, firstName: firstName.trim(), lastName: lastName.trim() },
      });
      if (signUp.status === "complete") {
        await setActive({ session: signUp.createdSessionId });
        await db.runAsync(
          "INSERT OR REPLACE INTO user_profile (clerk_id, first_name, last_name, role) VALUES (?, ?, ?, ?)",
          [signUp.createdUserId ?? "", firstName.trim(), lastName.trim(), role],
        );
        router.replace("/(app)");
      }
    } catch {
      // errors surface via the `errors` signal
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-6">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 shrink">
              <Pressable hitSlop={20} onPress={() => router.back()}>
                <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
              </Pressable>
              <Text className="text-3xl font-bold text-primary shrink" numberOfLines={1} adjustsFontSizeToFit>{t("register")}</Text>
            </View>
            <LanguageToggle />
          </View>

          {/* Role selection */}
          <View className="gap-3">
            <Text className="text-base font-semibold text-primary">{t("i_am_a")}</Text>
            <View className="flex-row gap-3">
              {ROLES.map(({ value, key, icon }) => {
                const selected = role === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setRole(value)}
                    className={`flex-1 items-center justify-center rounded-2xl p-5 border-2 ${
                      selected ? "bg-primary border-primary" : "bg-white border-gray-300"
                    }`}
                  >
                    <Ionicons name={icon as any} size={30} color={selected ? "white" : "#888"} />
                    <Text className={`mt-2 font-semibold ${selected ? "text-white" : "text-gray-500"}`}>
                      {t(key)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* First & Last Name */}
          <View className="flex-row gap-3">
            <View className="flex-1 gap-2">
              <Text className="text-base font-semibold text-primary">{t("first_name")}</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="eg. John"
                placeholderTextColor="#888888"
                className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
              />
            </View>
            <View className="flex-1 gap-2">
              <Text className="text-base font-semibold text-primary">{t("last_name")}</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="eg. Doe"
                placeholderTextColor="#888888"
                className="text-primary bg-white border border-primary rounded-2xl px-4 py-3 text-base"
              />
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-base font-semibold text-primary">{t("username")}</Text>
            <TextInput
              value={username}
              onChangeText={(v) => { setUsername(v); setShowErrors(false); }}
              placeholder="eg. john_doe"
              placeholderTextColor="#888888"
              autoCapitalize="none"
              autoCorrect={false}
              className={`text-primary bg-white border rounded-2xl px-4 py-3 text-base ${usernameError ? "border-red-500" : "border-primary"}`}
            />
            {usernameError && (
              <Text className="text-red-500 text-xs">{usernameError.longMessage ?? usernameError.message}</Text>
            )}
          </View>

          <View className="gap-2">
            <Text className="text-base font-semibold text-primary">{t("password")}</Text>
            <View className={`flex-row items-center bg-white border rounded-2xl px-4 ${passwordError ? "border-red-500" : "border-primary"}`}>
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); setShowErrors(false); }}
                placeholder="••••••••"
                placeholderTextColor="#888888"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 py-3 text-base text-primary"
              />
              <Pressable hitSlop={12} onPress={() => setShowPassword(p => !p)}>
                <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#888" />
              </Pressable>
            </View>
            {passwordError && (
              <Text className="text-red-500 text-xs">{passwordError.longMessage ?? passwordError.message}</Text>
            )}
          </View>

          {globalError && (
            <Text className="text-red-500 text-sm -mt-2">{globalError.longMessage ?? globalError.message}</Text>
          )}

          <Pressable
            className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full"
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text className="text-white text-xl font-bold">{t("create_account")}</Text>
            }
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
