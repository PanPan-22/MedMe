import { useNotifications } from "@/hooks/use-notifications";
import Feather from "@expo/vector-icons/Feather";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Link, Stack } from "expo-router";
import {
  Button,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

const dummy = [
  { id: "1", name: "Medication A" },
  { id: "2", name: "Medication B" },
  { id: "3", name: "Medication C" },
];

const { triggerNotification } = useNotifications();

export default function HomeScreen() {
  return (
    <ScrollView className="bg-background p-2">
      <Stack.Screen options={{ headerShown: true, title: "Home" }} />
      <View className="items-center">
        <View className="flex-row items-center justify-center border border-primary gap-4 p-2 mb-4">
          <Text className="text-3xl text-primary">Next Medication</Text>
          <View className="flex-row border-2 border-[#FFB916] bg-amber-50 rounded-full items-center justify-center gap-2 px-3 py-1">
            <Feather name="moon" size={32} color="#FFB916" />
            <Text className="text-[#FFB916] text-center text-3xl">8:00</Text>
          </View>
        </View>
        <View className="bg-white border border-primary rounded-2xl w-full p-2 mb-4">
          <FlatList
            data={dummy}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View className="flex-row items-center justify-between border-b border-gray-300 p-2">
                <Text className="text-lg">{item.name}</Text>
              </View>
            )}
          />
        </View>
        <Link href="/management" push asChild>
          <Pressable className="flex-row items-center justify-center gap-4 bg-primary rounded-xl p-4">
            <FontAwesome6 name="pills" size={32} color="white" />
            <Text className="text-2xl text-white">Medicine Management</Text>
          </Pressable>
        </Link>
        <Button title="Trigger Notification" onPress={triggerNotification} />
      </View>
    </ScrollView>
  );
}
