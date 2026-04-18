import { useAuth, useUser } from "@clerk/expo";
import Feather from "@expo/vector-icons/Feather";
import * as Notifications from "expo-notifications";
import { useNotifications } from "@/hooks/use-notifications";
import { useSyncEngine } from "@/hooks/use-sync-engine";
import { useSyncPresence } from "@/hooks/use-sync-presence";
import { Link, Redirect, router, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function AppHeader({ displayName }: { displayName: string }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isSettings = pathname === "/settings";
  return (
    <View
      className="w-full flex-row items-center justify-between px-4 pb-4 bg-primary"
      style={{ paddingTop: insets.top + 12 }}
    >
      <Text
        className="text-white text-xl font-semibold flex-1 mr-4"
        numberOfLines={1}
        maxFontSizeMultiplier={1.2}
      >
        {displayName}
      </Text>
      {!isSettings && (
        <Link href="/settings" push asChild>
          <Pressable hitSlop={16}>
            <Feather name="settings" size={24} color="white" />
          </Pressable>
        </Link>
      )}
    </View>
  );
}

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();
  useNotifications();
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
      }}
    >
      <Stack.Screen
        name="notification-modal"
        options={{ presentation: "modal", headerShown: false }}
      />
    </Stack>
  );
}
