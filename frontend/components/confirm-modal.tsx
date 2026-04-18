import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from "react-native";

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  cancelText: string;
  confirmText: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmModal({
  visible, title, message, cancelText, confirmText, destructive, onCancel, onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1">
        <Pressable className="flex-1 bg-black/60 justify-center items-center px-6" onPress={onCancel}>
          <Pressable className="bg-background rounded-3xl p-6 w-full gap-3" onPress={() => {}}>
            <Text className="text-xl font-bold text-primary">{title}</Text>
            {message ? <Text className="text-primary/70 mb-2">{message}</Text> : null}
            <View className="flex-row gap-3 mt-2">
              <Pressable
                className="active:opacity-70 flex-1 items-center justify-center border border-primary/30 rounded-2xl p-4"
                onPress={onCancel}
              >
                <Text className="text-primary font-semibold">{cancelText}</Text>
              </Pressable>
              <Pressable
                className={`active:opacity-70 flex-1 items-center justify-center rounded-2xl p-4 ${destructive ? "bg-red-500" : "bg-primary"}`}
                onPress={onConfirm}
              >
                <Text className={`font-bold ${destructive ? "text-white" : "text-background"}`}>{confirmText}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
