import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import { useColorScheme } from "nativewind";
import { Platform } from "react-native";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { colorScheme } = useColorScheme();
  if (!isLoaded) return null;
  if (isSignedIn) return <Redirect href="/(app)" />;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: Platform.OS === "android" ? "simple_push" : "ios_from_right",
        animationDuration: 250,
        contentStyle: {
          backgroundColor: colorScheme === "dark" ? "#0a1410" : "#f2fbf5",
        },
      }}
    />
  );
}
