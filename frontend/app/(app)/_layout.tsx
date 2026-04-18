import { useAuth, useUser } from "@clerk/expo";
import Feather from "@expo/vector-icons/Feather";
import { Link, Redirect, Stack } from "expo-router";
import { Pressable, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function AppLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user } = useUser();

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
        header: () => (
          <SafeAreaView className="flex-row w-full h-24 items-center justify-between p-4 bg-primary">
            <Text className="text-white text-xl truncate w-1/2" numberOfLines={1}>
              {displayName}
            </Text>
            <Link href="/settings" push asChild>
              <Pressable>
                <Feather name="settings" size={24} color="white" />
              </Pressable>
            </Link>
          </SafeAreaView>
        ),
        headerShown: true,
      }}
    />
  );
}
