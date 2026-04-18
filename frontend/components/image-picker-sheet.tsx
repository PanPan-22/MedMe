import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import ActionSheet, {
  registerSheet,
  SheetDefinition,
  SheetManager,
  SheetProps,
} from "react-native-actions-sheet";

declare module "react-native-actions-sheet" {
  interface Sheets {
    "image-picker-sheet": SheetDefinition<{
      payload: { aspect?: [number, number] } | undefined;
    }>;
  }
}

const ImageSheet = (props: SheetProps<"image-picker-sheet">) => {
  const aspect = props.payload?.aspect ?? [4, 3];
  const { t } = useTranslation();

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alert("Camera permission is required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect,
      quality: 0.9,
    });

    if (!result.canceled) {
      SheetManager.hide("image-picker-sheet", {
        payload: { uri: result.assets[0].uri },
      });
    }
  };

  const handleImagePickerPress = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect,
      quality: 0.9,
    });

    if (!result.canceled) {
      SheetManager.hide("image-picker-sheet", {
        payload: { uri: result.assets[0].uri },
      });
    }
  };

  return (
    <ActionSheet
      id="image-picker-sheet"
      containerStyle={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
    >
      <View className="p-6 h-64 bg-card">
        <Text className="text-xl font-bold text-slate-800 text-center mb-6">
          {t("add_photo")}
        </Text>

        <TouchableOpacity
          className="flex-row items-center p-4 bg-blue-50 rounded-2xl mb-4 active:bg-blue-100"
          onPress={takePhoto}
        >
          <View className="bg-blue-500 p-3 rounded-full">
            <Ionicons name="camera" size={24} color="white" />
          </View>
          <Text className="text-lg font-semibold text-blue-900 ml-4">
            {t("take_new_photo")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-row items-center p-4 bg-emerald-50 rounded-2xl active:bg-emerald-100"
          onPress={handleImagePickerPress}
        >
          <View className="bg-emerald-500 p-3 rounded-full">
            <Ionicons name="images" size={24} color="white" />
          </View>
          <Text className="text-lg font-semibold text-emerald-900 ml-4">
            {t("choose_gallery")}
          </Text>
        </TouchableOpacity>
      </View>
    </ActionSheet>
  );
};

registerSheet("image-picker-sheet", ImageSheet);

export default ImageSheet;
