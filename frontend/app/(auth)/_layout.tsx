import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform } from "react-native";

export default function AuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { colorScheme } = useColorScheme();

  // Signed-out users skip the home screens, so hide the splash here instead.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => { /* already hidden */ });
  }, []);

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
