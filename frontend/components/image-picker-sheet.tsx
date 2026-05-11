import { useBrandColor } from "@/hooks/use-brand-color";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useTranslation } from "react-i18next";
import { Text, TouchableOpacity, View } from "react-native";
import ActionSheet, {
  SheetDefinition,
  SheetManager,
  SheetProps,
} from "react-native-actions-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";

declare module "react-native-actions-sheet" {
  interface Sheets {
    "image-picker-sheet": SheetDefinition<{
      payload: { aspect?: [number, number]; noCrop?: boolean } | undefined;
    }>;
  }
}

const ImageSheet = (props: SheetProps<"image-picker-sheet">) => {
  const noCrop = props.payload?.noCrop ?? false;
  const aspect = props.payload?.aspect ?? [4, 3];
  const { t } = useTranslation();
  const { background } = useBrandColor();
  const insets = useSafeAreaInsets();

  const pickerOptions: ImagePicker.ImagePickerOptions = noCrop
    ? { mediaTypes: ["images"], allowsEditing: false, quality: 0.9 }
    : { mediaTypes: ["images"], allowsEditing: true, aspect, quality: 0.9 };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alert("Camera permission is required");
      return;
    }

    const result = await ImagePicker.launchCameraAsync(pickerOptions);

    if (!result.canceled) {
      SheetManager.hide("image-picker-sheet", {
        payload: { uri: result.assets[0].uri },
      });
    }
  };

  const handleImagePickerPress = async () => {
    const result = await ImagePicker.launchImageLibraryAsync(pickerOptions);

    if (!result.canceled) {
      SheetManager.hide("image-picker-sheet", {
        payload: { uri: result.assets[0].uri },
      });
    }
  };

  return (
    <ActionSheet
      id="image-picker-sheet"
      containerStyle={{
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        backgroundColor: background,
      }}
      indicatorStyle={{ backgroundColor: background }}
    >
      <View
        className="px-6 pt-6 bg-background"
        style={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="text-xl font-bold text-primary text-center mb-6">
          {t("add_photo")}
        </Text>

        <TouchableOpacity
          className="flex-row items-center p-4 bg-primary/10 rounded-2xl mb-4 active:bg-primary/20"
          onPress={takePhoto}
        >
          <View className="bg-primary p-3 rounded-full">
            <Ionicons name="camera" size={24} color={background} />
          </View>
          <Text className="text-lg font-semibold text-primary ml-4">
            {t("take_new_photo")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-row items-center p-4 bg-primary/10 rounded-2xl active:bg-primary/20"
          onPress={handleImagePickerPress}
        >
          <View className="bg-primary p-3 rounded-full">
            <Ionicons name="images" size={24} color={background} />
          </View>
          <Text className="text-lg font-semibold text-primary ml-4">
            {t("choose_gallery")}
          </Text>
        </TouchableOpacity>
      </View>
    </ActionSheet>
  );
};

export default ImageSheet;
