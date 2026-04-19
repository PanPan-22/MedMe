import { useAuth, useUser } from "@clerk/expo";
import Feather from "@expo/vector-icons/Feather";
import * as Notifications from "expo-notifications";
import { useBrandColor } from "@/hooks/use-brand-color";
import { useNotificationReconcile } from "@/hooks/use-notification-reconcile";
import { useNotifications } from "@/hooks/use-notifications";
import { useSyncEngine } from "@/hooks/use-sync-engine";
import { useSyncPresence } from "@/hooks/use-sync-presence";
import { useUserBoundary } from "@/hooks/use-user-boundary";
import { Link, Redirect, router, Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "nativewind";
import { useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function AppHeader({ displayName }: { displayName: string }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isSettings = pathname === "/settings";
  const { background } = useBrandColor();
  const { colorScheme } = useColorScheme();
  return (
    <View
      className="w-full flex-row items-center justify-between px-4 pb-4 bg-primary"
      style={{ paddingTop: insets.top + 12 }}
    >
      {/* Header background is bg-primary — invert status bar contrast vs the root default. */}
      <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />
      <Text
        className="text-background text-xl font-semibold flex-1 mr-4"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {displayName}
      </Text>
      {!isSettings && (
        <Link href="/settings" push asChild>
          <Pressable className="active:opacity-70" hitSlop={16}>
            <Feather name="settings" size={24} color={background} />
          </Pressable>
        </Link>
      )}
    </View>
  );
}

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  const { colorScheme } = useColorScheme();
  const bg = colorScheme === "dark" ? "#0a1410" : "#f2fbf5";
  useUserBoundary();
  useNotifications();
  useNotificationReconcile();
  useSyncPresence();
  useSyncEngine();

  useEffect(() => {
    // Handle notification tap (app already open or resuming from background)
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as any;
      if (data?.time) {
        router.push({
          pathname: "/notification-modal",
          params: { time: data.time, patientId: data.patientId ?? "" },
        });
      }
    });

    // Handle cold-start notification tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response?.notification.request.content.data) {
        const data = response.notification.request.content.data as any;
        if (data?.time) {
          router.push({
            pathname: "/notification-modal",
            params: { time: data.time, patientId: data.patientId ?? "" },
          });
        }
      }
    });

    return () => sub.remove();
  }, []);

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)" />;

  const meta = user?.unsafeMetadata as any;
  const displayName =
    [meta?.firstName, meta?.lastName].filter(Boolean).join(" ") ||
    user?.username ||
    "User";

  return (
    <Stack
      screenOptions={{
        header: () => <AppHeader displayName={displayName} />,
        headerShown: true,
        animation: Platform.OS === "android" ? "simple_push" : "ios_from_right",
        animationDuration: 250,
        contentStyle: { backgroundColor: bg },
      }}
    >
      <Stack.Screen
        name="notification-modal"
        options={{
          presentation: "modal",
          headerShown: false,
          animation: "slide_from_bottom",
          contentStyle: { backgroundColor: bg },
        }}
      />
    </Stack>
  );
}
