import { router, Stack } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

export default function ManagementScreen() {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [time, setTime] = useState("");
  const [note, setNote] = useState("");

  return (
    <ScrollView className="bg-background p-2">
      <Stack.Screen options={{ headerShown: true, title: "Manual Add" }} />
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Medication name</Text>
        <View className="text-primary bg-white border border-primary rounded-2xl px-2 mb-4>">
          <TextInput
            value={name}
            onChangeText={(newName) => setName(newName)}
            keyboardType="default"
            placeholder="Medication name"
            className="text-primary"
          />
        </View>
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Amount</Text>
        <View className="text-primary bg-white border border-primary rounded-2xl px-2 mb-4>">
          <TextInput
            value={amount}
            onChangeText={(newAmount) => setAmount(newAmount)}
            keyboardType="numeric"
            placeholder="Amount"
            className="text-primary"
          />
        </View>
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Time</Text>
        <View className="text-primary bg-white border border-primary rounded-2xl px-2 mb-4>">
          <TextInput
            value={time}
            onChangeText={(newTime) => setTime(newTime)}
            keyboardType="default"
            placeholder="Time"
            className="text-primary"
          />
        </View>
      </View>
      <View className="flex-column justify-between gap-4 p-2 mb-2 w-full">
        <Text className="text-2xl text-primary">Additional Note</Text>
        <View className="text-primary bg-white border border-primary rounded-2xl px-2 mb-4>">
          <TextInput
            value={note}
            onChangeText={(newNote) => setNote(newNote)}
            multiline={true}
            keyboardType="default"
            placeholder="Additional Note"
            className="text-primary"
          />
        </View>
      </View>
      <View className="items-center mt-8">
        <Pressable
          className="items-center justify-center bg-primary rounded-xl p-4 w-60"
          onPress={() => router.back()}
        >
          <Text className="text-2xl text-white">Submit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
