import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar"; // Import from here
import { useColorScheme } from "nativewind";
import "../global.css";

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <>
      <StatusBar style={colorScheme === "dark" ? "dark" : "light"} />
      <Stack />
    </>
  );
}
