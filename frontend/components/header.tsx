import { Text, View } from "react-native";

export function Header() {
  return (
    <View className="h-16 w-full items-center justify-center border-b border-gray-300 bg-red-500">
      <Text className="text-white font-bold">MedMe</Text>
    </View>
  );
}
