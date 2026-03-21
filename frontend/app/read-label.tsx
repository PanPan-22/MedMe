import ImageInput from "@/components/image-input";
import { Stack } from "expo-router";
import { ScrollView, Text, View } from "react-native";

export default function MedicineScreen() {
  return (
    <ScrollView>
      <Stack.Screen options={{ headerShown: true, title: "Read Label" }} />
      <View className="bg-background">
        <Text>Medicine Screen!</Text>
      </View>
      <ImageInput />
    </ScrollView>
  );
}
