import { useBrandColor } from "@/hooks/use-brand-color";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

interface Props {
  label: string;
  required?: boolean;
  info?: string;
  size?: "base" | "sm";
}

export function FieldLabel({ label, required, info, size = "base" }: Props) {
  const { primary, primarySoft } = useBrandColor();
  const [open, setOpen] = useState(false);
  const textCls = size === "sm"
    ? "text-sm font-semibold text-primary"
    : "text-base font-semibold text-primary";
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className={textCls}>{label}</Text>
      {required && <Text className="text-red-500 font-bold">*</Text>}
      {info && (
        <>
          <Pressable className="active:opacity-70" hitSlop={8} onPress={() => setOpen(true)}>
            <Ionicons name="information-circle-outline" size={iconSize} color={primarySoft} />
          </Pressable>
          <Modal
            visible={open}
            transparent
            animationType="fade"
            onRequestClose={() => setOpen(false)}
          >
            <Pressable
              className="flex-1 bg-black/60 justify-center items-center px-6"
              onPress={() => setOpen(false)}
            >
              <Pressable className="bg-background rounded-3xl p-6 w-full" onPress={() => {}}>
                <View className="flex-row items-start gap-3 mb-3">
                  <Ionicons
                    name="information-circle"
                    size={26}
                    color={primary}
                    style={{ marginTop: 2 }}
                  />
                  <Text className="text-xl font-bold text-primary flex-1" numberOfLines={2}>
                    {label}
                  </Text>
                  <Pressable className="active:opacity-70" hitSlop={10} onPress={() => setOpen(false)}>
                    <Ionicons name="close" size={22} color={primary} />
                  </Pressable>
                </View>
                <Text className="text-primary/80 text-base leading-6">{info}</Text>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}
