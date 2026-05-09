import { useBrandColor } from "@/hooks/use-brand-color";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

interface BackHeaderProps {
  title: string;
  onBack?: () => void;
  rightSlot?: ReactNode;
}

// Sticky back-row used at the top of nested screens. Place it as a sibling of
// the screen's ScrollView (NOT inside) so it stays visible while content scrolls.
export function BackHeader({ title, onBack, rightSlot }: BackHeaderProps) {
  const { primary } = useBrandColor();
  return (
    <View className="flex-row items-center gap-4 px-6 pt-6 pb-6 bg-background">
      <Pressable
        className="active:opacity-70"
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        onPress={onBack ?? (() => router.back())}
      >
        <Ionicons name="arrow-back-outline" size={24} color={primary} />
      </Pressable>
      <Text className="text-2xl font-bold text-primary flex-1" numberOfLines={1}>
        {title}
      </Text>
      {rightSlot}
    </View>
  );
}
