import LanguageToggle from "@/components/language-toggle";
import { useClerk, useSignIn } from "@clerk/expo";
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
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const { setActive } = useClerk();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [showErrors, setShowErrors] = useState(false);
  const loading = fetchStatus === "fetching";

  const raw = showErrors ? (errors as any)?.raw ?? [] : [];
  const usernameError = raw.find((e: any) => e.meta?.paramName === "identifier");
  const passwordError = raw.find((e: any) => e.meta?.paramName === "password");
  const globalError = raw.find((e: any) => !e.meta?.paramName);

  const handleSignIn = async () => {
    setShowErrors(true);
    try {
      await signIn.create({ identifier: username.trim(), password });
    } catch {
      // errors surface via the `errors` signal
    }
    if (signIn.status === "complete") {
      await setActive({ session: signIn.createdSessionId });
      router.replace("/(app)");
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-background"
    >
      <View className="flex-1 px-6 justify-center gap-6" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-3 shrink">
            <Pressable hitSlop={20} onPress={() => router.back()}>
              <Ionicons name="arrow-back-outline" size={24} color={colors.text} />
            </Pressable>
            <Text className="text-3xl font-bold text-primary shrink" numberOfLines={1} adjustsFontSizeToFit>{t("sign_in")}</Text>
          </View>
          <LanguageToggle />
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
          {usernameError && <Text className="text-red-500 text-xs">{usernameError.longMessage ?? usernameError.message}</Text>}
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
          {passwordError && <Text className="text-red-500 text-xs">{passwordError.longMessage ?? passwordError.message}</Text>}
        </View>

        {globalError && <Text className="text-red-500 text-sm -mt-2">{globalError.longMessage ?? globalError.message}</Text>}

        <Pressable
          className="active:opacity-70 items-center justify-center bg-primary rounded-2xl p-4 w-full"
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="white" />
            : <Text className="text-white text-xl font-bold">{t("sign_in")}</Text>
          }
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
